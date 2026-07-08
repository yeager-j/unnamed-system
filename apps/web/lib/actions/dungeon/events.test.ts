import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createDungeonState,
  type DungeonState,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import { err, ok } from "@workspace/game/foundation"

import { applyDungeonEvent } from "./events"

// Stub the seams — the DM gate, the campaignId + row loads, the Instance load, and
// the guarded dungeon / Instance writes — so this is a pure unit test of the
// dungeon-vs-spatial routing; the reducers + schema run for real. `requireCampaignDM`
// throws `forbidden()`; stub it to throw a sentinel so the rejection is assertable.
const requireCampaignDM = vi.fn()
const loadDungeonCampaignId = vi.fn()
const loadDungeonRowById = vi.fn()
const loadMapInstanceById = vi.fn()
const saveDungeonState = vi.fn()
const saveMapInstanceState = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()
const publishDungeonInstancePing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonCampaignId: (id: string) => loadDungeonCampaignId(id),
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  saveDungeonState: (id: string, state: DungeonState, v: number) =>
    saveDungeonState(id, state, v),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  saveMapInstanceState: (
    tx: unknown,
    id: string,
    state: MapInstanceState,
    v: number
  ) => saveMapInstanceState(tx, id, state, v),
}))
vi.mock("./revalidate", () => ({
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
  publishDungeonInstancePing: (shortId: string, version: number) =>
    publishDungeonInstancePing(shortId, version),
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"

function dungeonRow(state: DungeonState = createDungeonState()) {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    mapInstanceId: MAP_INSTANCE_ID,
    shortId: "dng-short",
    status: "active" as const,
    state,
    version: 0,
  }
}

function instanceRow(): {
  id: string
  mapId: null
  state: MapInstanceState
  version: number
} {
  return {
    id: MAP_INSTANCE_ID,
    mapId: null,
    state: {
      geometry: {
        zones: {
          z1: {
            id: "z1",
            name: "Hall",
            description: "",
            dmNotes: "",
            position: { x: 0, y: 0 },
          },
        },
        connections: {},
      },
      occupancy: {},
      enchantment: null,
      reveal: {
        revealedZoneIds: [],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    },
    version: 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonCampaignId.mockResolvedValue(CAMPAIGN_ID)
  loadDungeonRowById.mockResolvedValue(dungeonRow())
  loadMapInstanceById.mockResolvedValue(instanceRow())
  requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID })
  saveDungeonState.mockResolvedValue(ok({ version: 1 }))
  saveMapInstanceState.mockResolvedValue(ok({ version: 5 }))
})

describe("applyDungeonEvent — auth + validation", () => {
  it("rejects a malformed payload before any DB read", async () => {
    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      expectedVersion: 0,
      event: { kind: "bogus" } as never,
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadDungeonCampaignId).not.toHaveBeenCalled()
  })

  it("returns dungeon-not-found and never gates when the campaign is gone", async () => {
    loadDungeonCampaignId.mockResolvedValue(null)

    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      expectedVersion: 0,
      event: { kind: "advanceTurn" },
    })

    expect(result).toEqual({ ok: false, error: "dungeon-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    const forbidden = new Error("forbidden")
    requireCampaignDM.mockRejectedValue(forbidden)

    await expect(
      applyDungeonEvent({
        dungeonId: DUNGEON_ID,
        expectedVersion: 0,
        event: { kind: "advanceTurn" },
      })
    ).rejects.toBe(forbidden)
    expect(saveDungeonState).not.toHaveBeenCalled()
  })
})

describe("applyDungeonEvent — routing", () => {
  it("routes a turn-loop event to the dungeon row, not the Instance", async () => {
    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      expectedVersion: 0,
      event: { kind: "markActed", characterId: "char-1" },
    })

    expect(result).toEqual({ ok: true, value: { version: 1 } })
    const [, savedState] = saveDungeonState.mock.calls[0]!
    expect((savedState as DungeonState).actedCharacterIds).toEqual(["char-1"])
    expect(saveMapInstanceState).not.toHaveBeenCalled()
    expect(revalidateDungeon).toHaveBeenCalled()
    // A turn-loop write bumps the dungeon row → a `dungeon`-kind ping (UNN-468).
    expect(publishDungeonPing).toHaveBeenCalledExactlyOnceWith("dng-short", {
      version: 1,
      status: "active",
    })
    expect(publishDungeonInstancePing).not.toHaveBeenCalled()
  })

  it("routes a spatial event to the Instance row, not the dungeon, returning the Instance version", async () => {
    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      event: { kind: "revealZone", zoneId: "z1" },
    })

    expect(result).toEqual({ ok: true, value: { version: 5 } })
    const [, , savedState, expectedV] = saveMapInstanceState.mock.calls[0]!
    expect((savedState as MapInstanceState).reveal.revealedZoneIds).toEqual([
      "z1",
    ])
    expect(expectedV).toBe(0)
    expect(saveDungeonState).not.toHaveBeenCalled()
    // A reveal/move bumps only the Instance → a `mapInstance`-kind ping.
    expect(publishDungeonInstancePing).toHaveBeenCalledExactlyOnceWith(
      "dng-short",
      5
    )
    expect(publishDungeonPing).not.toHaveBeenCalled()
  })

  it("requires the Instance version for a spatial event", async () => {
    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      expectedVersion: 0,
      event: { kind: "revealZone", zoneId: "z1" },
    })

    expect(result).toEqual({ ok: false, error: "missing-instance-version" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("propagates a stale guarded-write error and skips revalidation", async () => {
    saveDungeonState.mockResolvedValue(err("stale"))

    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      expectedVersion: 0,
      event: { kind: "advanceTurn" },
    })

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })
})
