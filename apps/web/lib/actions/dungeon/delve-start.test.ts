import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MapGeometry, MapInstanceState } from "@workspace/game-v2/spatial"
import { err, ok } from "@workspace/result"

import { startDelveAction } from "./delve-start"

// Stub the seams; the engine (mapInstanceFromGeometry / addOccupant) runs for real,
// and `guardMany` runs its body inline with a sentinel executor (the real
// transaction rollback is covered by guard-many.test.ts) so this asserts the
// delve-start orchestration: snapshot + place + status flip composed atomically.
const requireCampaignDM = vi.fn()
const loadDungeonRowById = vi.fn()
const loadActiveDungeonForCampaign = vi.fn()
const loadMapInstanceById = vi.fn()
const loadMapRowById = vi.fn()
const setDungeonStatus = vi.fn()
const saveMapInstanceState = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
  loadActiveDungeonForCampaign: (id: string) =>
    loadActiveDungeonForCampaign(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/queries/load-map", () => ({
  loadMapRowById: (id: string) => loadMapRowById(id),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  setDungeonStatus: (id: string, status: string, v: number, tx: unknown) =>
    setDungeonStatus(id, status, v, tx),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  saveMapInstanceState: (
    tx: unknown,
    id: string,
    state: MapInstanceState,
    v: number
  ) => saveMapInstanceState(tx, id, state, v),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  guardMany: async (body: (tx: unknown) => unknown) => body("tx"),
}))
vi.mock("./revalidate", () => ({
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"
const MAP_ID = "map-1"

const GEOMETRY: MapGeometry = {
  pages: { default: { id: "default", name: "Page 1" } },
  zones: {
    z1: {
      id: "z1",
      name: "Entry Hall",
      description: "",
      dmNotes: "",
      position: { x: 0, y: 0 },
      pageId: "default",
    },
  },
  connections: {},
}

function draftDungeon() {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    mapInstanceId: MAP_INSTANCE_ID,
    shortId: "dng-short",
    status: "draft" as const,
    version: 0,
  }
}

const startInput = {
  dungeonId: DUNGEON_ID,
  expectedVersion: 0,
  expectedInstanceVersion: 0,
  placements: [{ characterId: "char-1", zoneId: "z1" }],
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonRowById.mockResolvedValue(draftDungeon())
  requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID })
  loadActiveDungeonForCampaign.mockResolvedValue(null)
  loadMapInstanceById.mockResolvedValue({ id: MAP_INSTANCE_ID, mapId: MAP_ID })
  loadMapRowById.mockResolvedValue({ id: MAP_ID, geometry: GEOMETRY })
  setDungeonStatus.mockResolvedValue(ok({ version: 1 }))
  saveMapInstanceState.mockResolvedValue(ok({ version: 5 }))
})

describe("startDelveAction", () => {
  it("rejects starting a delve that is not in draft", async () => {
    loadDungeonRowById.mockResolvedValue({
      ...draftDungeon(),
      status: "active",
    })

    const result = await startDelveAction(startInput)

    expect(result).toEqual({ ok: false, error: "delve-not-draft" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("rejects when another delve already holds the active slot", async () => {
    loadActiveDungeonForCampaign.mockResolvedValue({ id: "other-delve" })

    const result = await startDelveAction(startInput)

    expect(result).toEqual({
      ok: false,
      error: "campaign-already-has-active-delve",
    })
    expect(setDungeonStatus).not.toHaveBeenCalled()
  })

  it("snapshots geometry, places + reveals the roster, flips active, and returns both versions", async () => {
    const result = await startDelveAction(startInput)

    expect(result).toEqual({
      ok: true,
      value: { version: 1, instanceVersion: 5 },
    })

    const [, , savedState] = saveMapInstanceState.mock.calls[0]!
    const next = savedState as MapInstanceState
    expect(next.geometry.zones.z1).toBeDefined()
    expect(next.occupancy["char-1"]).toEqual({
      zoneId: "z1",
      engagement: { status: "free" },
    })
    expect(next.reveal.revealedZoneIds).toEqual(["z1"])

    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "active", 0, "tx")
    expect(revalidateDungeon).toHaveBeenCalled()
    // The delve went live → a dungeon ping with status active (UNN-468).
    expect(publishDungeonPing).toHaveBeenCalledOnce()
    expect(publishDungeonPing.mock.lastCall?.[1]).toMatchObject({
      status: "active",
    })
  })

  it("surfaces a guard failure and does not revalidate (atomic — neither row commits)", async () => {
    setDungeonStatus.mockResolvedValue(err("stale"))

    const result = await startDelveAction(startInput)

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })
})
