import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  defaultOverlay,
  makeParticipant,
  type Session,
  type StoredEntityLocator,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import {
  createDungeonState,
  type DungeonState,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import { err, ok } from "@workspace/result"

import type { LoadedEncounterForWrite } from "@/lib/db/queries/load-encounter-session"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { EncounterRow } from "@/lib/db/schema/encounter"

import { endDungeonCombatAction } from "./end-combat"

const requireCampaignDM = vi.fn()
const loadDungeonRowById = vi.fn()
const loadEncounterForWrite = vi.fn()
const loadMapInstanceById = vi.fn()
const saveEncounterSession = vi.fn()
const setEncounterStatus = vi.fn()
const saveMapInstanceState = vi.fn()
const saveDungeonState = vi.fn()
const lockDungeonRowForLifecycle = vi.fn()
const revalidateDungeon = vi.fn()
const publishEncounterPing = vi.fn()
const publishDungeonInstancePing = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForWrite: (id: string) => loadEncounterForWrite(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  setEncounterStatus: (id: string, status: string, v: number, tx: unknown) =>
    setEncounterStatus(id, status, v, tx),
  saveEncounterSession: (
    id: string,
    stored: StoredSession,
    v: number,
    tx: unknown
  ) => saveEncounterSession(id, stored, v, tx),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  saveMapInstanceState: (
    tx: unknown,
    id: string,
    state: MapInstanceState,
    v: number
  ) => saveMapInstanceState(tx, id, state, v),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  saveDungeonState: (id: string, state: DungeonState, v: number, tx: unknown) =>
    saveDungeonState(id, state, v, tx),
  lockDungeonRowForLifecycle: (tx: unknown, id: string, v: number) =>
    lockDungeonRowForLifecycle(tx, id, v),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  guardMany: async (body: (tx: unknown) => unknown) => body("tx"),
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

const ENCOUNTER_ID = "encounter-1"
const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"
const PC_ID = asParticipantId("c-pc")
const GOBLIN_ID = asParticipantId("c-goblin")

function makeDirtySession(): Session {
  const session: Session = {
    round: 3,
    currentActorId: PC_ID,
    advantage: "players",
    firstSide: "players",
    participants: [
      makeParticipant(
        { id: "char-1", components: { vitals: { base: 30, damage: 10 } } },
        PC_ID,
        { side: "players" }
      ),
      makeParticipant(
        { id: "goblin-1", components: { vitals: { base: 16, damage: 3 } } },
        GOBLIN_ID,
        { side: "enemies" }
      ),
    ],
  }
  session.participants[0]!.overlay.ailments = ["burn"]
  session.participants[1]!.overlay.battleConditions.attack = "increased"
  return session
}

function makeLocators(): Map<ParticipantId, StoredEntityLocator> {
  return new Map<ParticipantId, StoredEntityLocator>([
    [PC_ID, { storage: "durable", entityId: "char-1" }],
    [
      GOBLIN_ID,
      {
        storage: "inline",
        entity: {
          id: "goblin-1",
          components: { vitals: { base: 16, damage: 3 } },
        },
      },
    ],
  ])
}

function makeInstanceState(): MapInstanceState {
  return {
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: {
        z: {
          id: "z",
          name: "Zone",
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
          pageId: "default",
        },
      },
      connections: {},
    },
    occupancy: {
      [PC_ID]: {
        zoneId: "z",
        engagement: { status: "engaged", targetCombatantIds: [GOBLIN_ID] },
      },
      [GOBLIN_ID]: {
        zoneId: "z",
        engagement: { status: "engaged", targetCombatantIds: [PC_ID] },
      },
    },
    enchantment: { type: "toccata", zoneId: "z", forte: 1 },
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    generation: { zones: {}, grafts: {} },
    lastMovedTokenKey: null,
  }
}

function makeLoaded(status: EncounterRow["status"]): LoadedEncounterForWrite {
  return {
    row: {
      id: ENCOUNTER_ID,
      campaignId: CAMPAIGN_ID,
      shortId: "enc1",
      name: "Test",
      status,
      mapInstanceId: MAP_INSTANCE_ID,
      session: { round: 3 },
      version: 4,
    } as EncounterRow,
    loaded: { session: makeDirtySession(), locators: makeLocators() },
    durableVersions: new Map([["char-1", 3]]),
  }
}

function makeDungeonRow(turnCounter = 4): DungeonRow {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "dng1",
    mapInstanceId: MAP_INSTANCE_ID,
    name: "Delve",
    status: "active",
    state: { ...createDungeonState(), turnCounter },
    version: 2,
  } as DungeonRow
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  // The pre-transaction read is deliberately STALE (turnCounter 99): the
  // `advanceTurn` must reduce from the LOCKED row's state (turnCounter 4), not
  // this one — proving the D11 lock-first ordering, not the pre-read.
  loadDungeonRowById.mockReset().mockResolvedValue(makeDungeonRow(99))
  lockDungeonRowForLifecycle
    .mockReset()
    .mockResolvedValue(ok(makeDungeonRow(4)))
  loadEncounterForWrite.mockReset().mockResolvedValue(ok(makeLoaded("live")))
  loadMapInstanceById.mockReset().mockResolvedValue({
    id: MAP_INSTANCE_ID,
    state: makeInstanceState(),
    version: 7,
  })
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 5 }))
  setEncounterStatus.mockReset().mockResolvedValue(ok({ version: 6 }))
  saveMapInstanceState.mockReset().mockResolvedValue(ok({ version: 8 }))
  saveDungeonState.mockReset().mockResolvedValue(ok({ version: 3 }))
  revalidateDungeon.mockReset()
  publishEncounterPing.mockReset()
  publishDungeonInstancePing.mockReset()
  publishDungeonPing.mockReset()
})

const INPUT = {
  encounterId: ENCOUNTER_ID,
  dungeonId: DUNGEON_ID,
  expectedEncounterVersion: 4,
  expectedInstanceVersion: 7,
  expectedDungeonVersion: 2,
}

describe("endDungeonCombatAction — three-row composed combat-end (PR11c)", () => {
  it("sweeps the session, prunes ephemeral tokens, keeps PC token in place", async () => {
    const result = await endDungeonCombatAction(INPUT)
    expect(result).toEqual(ok({ version: 6, instanceVersion: 8 }))

    const blob = saveEncounterSession.mock.calls[0]![1] as StoredSession
    expect(blob.participants.find((p) => p.id === PC_ID)!.overlay).toEqual(
      defaultOverlay({ side: "players" })
    )

    const pruned = saveMapInstanceState.mock.calls[0]![2] as MapInstanceState
    expect(pruned.occupancy[GOBLIN_ID]).toBeUndefined()
    expect(pruned.occupancy[PC_ID]).toEqual({
      zoneId: "z",
      engagement: { status: "free" },
    })
    expect(pruned.enchantment).toBeNull()
  })

  it("advances the dungeon turn from the LOCKED row's state, in the same transaction", async () => {
    await endDungeonCombatAction(INPUT)

    // Locked row was turnCounter 4 → 5; the stale pre-read (99) is never reduced.
    const nextState = saveDungeonState.mock.calls[0]![1] as DungeonState
    expect(nextState.turnCounter).toBe(5)
    expect(saveDungeonState).toHaveBeenCalledWith(
      DUNGEON_ID,
      expect.anything(),
      2,
      "tx"
    )
  })

  it("propagates a stale lock (lost the dungeon version race) without writing", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(err("stale"))
    const result = await endDungeonCombatAction(INPUT)
    expect(result).toEqual(err("stale"))
    expect(saveMapInstanceState).not.toHaveBeenCalled()
    expect(saveEncounterSession).not.toHaveBeenCalled()
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })

  it("chains the encounter version: status flip guards on the bumped session version", async () => {
    await endDungeonCombatAction(INPUT)

    expect(saveEncounterSession).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      expect.anything(),
      4,
      "tx"
    )
    expect(setEncounterStatus).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      "ended",
      5,
      "tx"
    )
  })

  it("pings all three streams on success", async () => {
    await endDungeonCombatAction(INPUT)
    expect(publishEncounterPing).toHaveBeenCalledWith("enc1", {
      version: 6,
      status: "ended",
    })
    expect(publishDungeonInstancePing).toHaveBeenCalledWith("dng1", 8)
    expect(publishDungeonPing).toHaveBeenCalledWith("dng1", {
      version: 3,
      status: "active",
    })
  })

  it("rejects an encounter running on a different Instance", async () => {
    const loaded = makeLoaded("live")
    loaded.row = { ...loaded.row, mapInstanceId: "other-mi" }
    loadEncounterForWrite.mockResolvedValue(ok(loaded))

    const result = await endDungeonCombatAction(INPUT)
    expect(result).toEqual(err("encounter-not-on-dungeon"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("rejects a non-live encounter", async () => {
    loadEncounterForWrite.mockResolvedValue(ok(makeLoaded("ended")))
    const result = await endDungeonCombatAction(INPUT)
    expect(result).toEqual(err("encounter-not-live"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("propagates a stale dungeon write and fires no pings (rollback path)", async () => {
    saveDungeonState.mockResolvedValue(err("stale"))
    const result = await endDungeonCombatAction(INPUT)
    expect(result).toEqual(err("stale"))
    expect(publishEncounterPing).not.toHaveBeenCalled()
    expect(publishDungeonPing).not.toHaveBeenCalled()
  })
})
