import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeParticipant,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { err, ok } from "@workspace/result"

import type { DungeonRow } from "@/lib/db/schema/dungeon"

import { startDungeonEncounterAction } from "./start-encounter"

const requireCampaignDM = vi.fn()
const loadDungeonRowById = vi.fn()
const loadLiveEncounterIdForCampaign = vi.fn()
const loadMapInstanceById = vi.fn()
const loadLiveEntityRowById = vi.fn()
const createEncounter = vi.fn()
const saveMapInstanceState = vi.fn()
const lockDungeonRowForLifecycle = vi.fn()
const touchDungeonLifecycle = vi.fn()
const revalidateDungeon = vi.fn()
const publishEncounterPing = vi.fn()
const publishDungeonInstancePing = vi.fn()
const publishDungeonPing = vi.fn()
const instantiateEnemy = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadLiveEncounterIdForCampaign: (id: string, tx: unknown) =>
    loadLiveEncounterIdForCampaign(id, tx),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/queries/load-entity", () => ({
  loadLiveEntityRowById: (id: string) => loadLiveEntityRowById(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  createEncounter: (input: unknown, tx: unknown) => createEncounter(input, tx),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  loadMapInstanceForWriteLocked: async (tx: unknown, id: string) => {
    const row = await loadMapInstanceById(id, tx)
    return row === null
      ? err("map-instance-not-found")
      : ok({ ...row, status: "open" })
  },
  saveLockedMapInstanceState: (
    tx: unknown,
    row: { id: string; version: number },
    state: MapInstanceState
  ) => saveMapInstanceState(tx, row.id, state, row.version),
  saveMapInstanceState: (
    tx: unknown,
    id: string,
    state: MapInstanceState,
    v: number
  ) => saveMapInstanceState(tx, id, state, v),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  lockDungeonRowForLifecycle: (tx: unknown, id: string, v: number) =>
    lockDungeonRowForLifecycle(tx, id, v),
  touchDungeonLifecycle: (tx: unknown, id: string, v: number) =>
    touchDungeonLifecycle(tx, id, v),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  guardMany: async (body: (tx: unknown) => unknown) => body("tx"),
}))
vi.mock("@/domain/game-v2/entity-row-to-bag", () => ({
  loadEntityRow: (row: { id: string }): { ok: true; value: Entity } => ({
    ok: true,
    value: { id: row.id, components: { vitals: { base: 20, damage: 0 } } },
  }),
}))
vi.mock("@/domain/game-engine-v2", () => ({
  // Faithful to createSessionFactory for entity sources: map setups → participants.
  createSession: (
    setups: Array<{
      id: ParticipantId
      side: "players" | "enemies"
      source: { entity: Entity }
    }>
  ) => ({
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: setups.map((s) =>
      makeParticipant(s.source.entity, s.id, { side: s.side })
    ),
  }),
  instantiateEnemy: (key: string, id: string) => instantiateEnemy(key, id),
}))
vi.mock("./revalidate", () => ({
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
  publishDungeonInstancePing: (shortId: string, version: number) =>
    publishDungeonInstancePing(shortId, version),
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"
const PC_ID = "char-pc"

function makeDungeonRow(status: DungeonRow["status"] = "active"): DungeonRow {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "dng1",
    mapInstanceId: MAP_INSTANCE_ID,
    name: "Delve",
    status,
    state: {},
    version: 2,
  } as DungeonRow
}

/** The PC already stands on `z1` (its exploration token); `z2` is open. */
function makeInstanceState(): MapInstanceState {
  const zone = (id: string) => ({
    id,
    name: id,
    description: "",
    dmNotes: "",
    position: { x: 0, y: 0 },
    pageId: "default",
  })
  return {
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: { z1: zone("z1"), z2: zone("z2") },
      connections: {},
    },
    occupancy: {
      [PC_ID]: { zoneId: "z1", engagement: { status: "free" } },
    },
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    generation: { zones: {}, stubs: {}, connections: {}, grafts: {} },
    lastMovedTokenKey: null,
  }
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadDungeonRowById.mockReset().mockResolvedValue(makeDungeonRow())
  loadLiveEncounterIdForCampaign.mockReset().mockResolvedValue(null)
  loadMapInstanceById.mockReset().mockResolvedValue({
    id: MAP_INSTANCE_ID,
    state: makeInstanceState(),
    version: 7,
  })
  loadLiveEntityRowById.mockReset().mockResolvedValue({ id: PC_ID })
  createEncounter
    .mockReset()
    .mockResolvedValue({ id: "new-enc", shortId: "new-short" })
  saveMapInstanceState.mockReset().mockResolvedValue(ok({ version: 8 }))
  // The locked row is still active — the in-tx re-check passes.
  lockDungeonRowForLifecycle.mockReset().mockResolvedValue(ok(makeDungeonRow()))
  touchDungeonLifecycle.mockReset().mockResolvedValue(ok({ version: 3 }))
  revalidateDungeon.mockReset()
  publishEncounterPing.mockReset()
  publishDungeonInstancePing.mockReset()
  publishDungeonPing.mockReset()
  instantiateEnemy
    .mockReset()
    .mockImplementation((key: string, id: string): Entity | undefined =>
      key === "goblin"
        ? { id, components: { vitals: { base: 10, damage: 0 } } }
        : undefined
    )
})

const INPUT = {
  dungeonId: DUNGEON_ID,
  expectedVersion: 2,
  expectedInstanceVersion: 7,
  name: "Ambush",
  advantage: "players" as const,
  firstSide: "players" as const,
  partyCharacterIds: [PC_ID],
  enemies: [{ enemyKey: "goblin", zoneId: "z2", count: 1 }],
}

describe("startDungeonEncounterAction — atomic already-live mint (PR11c)", () => {
  it("mints a live encounter, co-minting the enemy while preserving the PC token", async () => {
    const result = await startDungeonEncounterAction(INPUT)
    expect(result).toEqual(ok({ shortId: "new-short" }))

    expect(createEncounter).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        mapInstanceId: MAP_INSTANCE_ID,
        status: "live",
      }),
      "tx"
    )
    // Combat start bumps the dungeon lifecycle token so a racing finish conflicts.
    expect(touchDungeonLifecycle).toHaveBeenCalledWith("tx", DUNGEON_ID, 2)

    const nextInstance = saveMapInstanceState.mock
      .calls[0]![2] as MapInstanceState
    // PC token preserved in place (exploration token = combat token).
    expect(nextInstance.occupancy[PC_ID]).toEqual({
      zoneId: "z1",
      engagement: { status: "free" },
    })
    // Exactly one enemy token was co-minted onto the staged zone.
    const enemyTokens = Object.entries(nextInstance.occupancy).filter(
      ([key]) => key !== PC_ID
    )
    expect(enemyTokens).toHaveLength(1)
    expect(enemyTokens[0]![1].zoneId).toBe("z2")
  })

  it("stores the PC as a durable participant keyed by characterId (token = combat token)", async () => {
    await startDungeonEncounterAction(INPUT)
    const blob = createEncounter.mock.calls[0]![0].session as StoredSession
    const pc = blob.participants.find((p) => p.id === PC_ID)!
    expect(pc.locator).toEqual({ storage: "durable", entityId: PC_ID })
    expect(blob.advantage).toBe("players")
  })

  it("pings the encounter, instance, and dungeon streams on success (D11)", async () => {
    await startDungeonEncounterAction(INPUT)
    expect(publishEncounterPing).toHaveBeenCalledWith("new-short", {
      version: 0,
      status: "live",
    })
    expect(publishDungeonInstancePing).toHaveBeenCalledWith("dng1", 8)
    expect(publishDungeonPing).toHaveBeenCalledWith("dng1", {
      version: 3,
      status: "active",
    })
  })

  it("rejects a delve that is not active (friendly pre-read)", async () => {
    loadDungeonRowById.mockResolvedValue(makeDungeonRow("draft"))
    const result = await startDungeonEncounterAction(INPUT)
    expect(result).toEqual({ ok: false, error: "delve-not-active" })
    expect(createEncounter).not.toHaveBeenCalled()
  })

  it("rejects when the locked row is no longer active (a racing finish won)", async () => {
    // The friendly pre-read saw `active`; under the lock the row already flipped.
    lockDungeonRowForLifecycle.mockResolvedValue(ok(makeDungeonRow("done")))
    const result = await startDungeonEncounterAction(INPUT)
    expect(result).toEqual({ ok: false, error: "delve-not-active" })
    expect(createEncounter).not.toHaveBeenCalled()
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("rejects when the campaign already has a live encounter (friendly pre-read)", async () => {
    loadLiveEncounterIdForCampaign.mockResolvedValue("other-enc")
    const result = await startDungeonEncounterAction(INPUT)
    expect(result).toEqual({
      ok: false,
      error: "campaign-already-has-live-encounter",
    })
  })

  it("rejects when a live encounter appears under the lock (in-tx re-check)", async () => {
    // Boundary read clean, but the in-tx read (after the lock) finds one — a
    // racing start committed between the two reads.
    loadLiveEncounterIdForCampaign
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("other-enc")
    const result = await startDungeonEncounterAction(INPUT)
    expect(result).toEqual({
      ok: false,
      error: "campaign-already-has-live-encounter",
    })
    expect(createEncounter).not.toHaveBeenCalled()
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("rejects an unknown enemy key before any write", async () => {
    const result = await startDungeonEncounterAction({
      ...INPUT,
      enemies: [{ enemyKey: "dragon", zoneId: "z2", count: 1 }],
    })
    expect(result).toEqual({ ok: false, error: "unknown-enemy" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("rejects a party member with no exploration token (unplaced roster)", async () => {
    const bare = makeInstanceState()
    delete bare.occupancy[PC_ID]
    loadMapInstanceById.mockResolvedValue({
      id: MAP_INSTANCE_ID,
      state: bare,
      version: 7,
    })
    const result = await startDungeonEncounterAction(INPUT)
    expect(result).toEqual({
      ok: false,
      error: "encounter-has-unplaced-combatants",
    })
    expect(createEncounter).not.toHaveBeenCalled()
  })

  it("propagates a stale lifecycle touch and fires no pings", async () => {
    touchDungeonLifecycle.mockResolvedValue(err("stale"))
    const result = await startDungeonEncounterAction(INPUT)
    expect(result).toEqual({ ok: false, error: "stale" })
    expect(publishEncounterPing).not.toHaveBeenCalled()
    expect(publishDungeonPing).not.toHaveBeenCalled()
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })
})
