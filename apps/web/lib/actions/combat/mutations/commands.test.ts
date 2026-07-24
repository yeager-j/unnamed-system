import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeParticipant,
  type LoadedSession,
  type Session,
} from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { makeGenerationState } from "@workspace/game-v2/spatial/__fixtures__/spatial"
import { createStampAccumulator, revisionAt } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { err, ok } from "@workspace/result"

import {
  dungeonAxis,
  encounterAxis,
  entityVitalsAxis,
  mapInstanceAxis,
} from "@/lib/db/axes"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { EncounterRow } from "@/lib/db/schema/encounter"

const loadEncounterForWrite = vi.fn()
const loadCampaignRowById = vi.fn()
const loadPlayerCharacterById = vi.fn()
const authorizeEntityWrite = vi.fn()
const commitEntityWrite = vi.fn()
const saveEncounterSession = vi.fn()
const setEncounterStatus = vi.fn()
const loadDungeonRowByMapInstanceId = vi.fn()
const lockDungeonRowForMutation = vi.fn()
const loadMapInstanceById = vi.fn()
const saveMapInstanceState = vi.fn()
const saveDungeonState = vi.fn()
const revalidateEncounter = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForWrite: (...args: unknown[]) => loadEncounterForWrite(...args),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignRowById: (...args: unknown[]) => loadCampaignRowById(...args),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowByMapInstanceId: (...args: unknown[]) =>
    loadDungeonRowByMapInstanceId(...args),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (...args: unknown[]) => loadMapInstanceById(...args),
}))
vi.mock("@/lib/db/queries/load-player-character", () => ({
  loadPlayerCharacterById: (...args: unknown[]) =>
    loadPlayerCharacterById(...args),
}))
vi.mock("../../entity/authorize-write", () => ({
  authorizeEntityWrite: (...args: unknown[]) => authorizeEntityWrite(...args),
  isEntityWriteAuthRejection: (value: string) => value === "unauthorized",
}))
vi.mock("../../entity/entity-row-store", () => ({
  commitEntityWrite: (...args: unknown[]) => commitEntityWrite(...args),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  saveEncounterSession: (...args: unknown[]) => saveEncounterSession(...args),
  setEncounterStatus: (...args: unknown[]) => setEncounterStatus(...args),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  lockDungeonRowForMutation: (...args: unknown[]) =>
    lockDungeonRowForMutation(...args),
  saveDungeonState: (...args: unknown[]) => saveDungeonState(...args),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  saveMapInstanceState: (...args: unknown[]) => saveMapInstanceState(...args),
}))
vi.mock("../../encounter/revalidate", () => ({
  revalidateEncounter: (...args: unknown[]) => revalidateEncounter(...args),
}))

const { combatEndCommand, combatEventCommand, combatWriteCommand } =
  await import("./commands")

const participantId = asParticipantId("participant-1")
const actor = { userId: "dm-1", email: "dm@example.com" }
const mutationId = "00000000-0000-4000-8000-000000000001"
const row = {
  id: "encounter-1",
  shortId: "short-1",
  campaignId: "campaign-1",
  mapInstanceId: "instance-1",
  name: "Ambush",
  notes: null,
  status: "live" as const,
  version: 3,
  session: {},
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as EncounterRow
const entity = {
  id: "entity-1",
  components: {
    identity: { name: "Goblin" },
    vitals: { base: 20, damage: 0 },
  },
}
const session: Session = {
  round: 1,
  currentActorId: null,
  advantage: null,
  firstSide: null,
  participants: [makeParticipant(entity, participantId, { side: "enemies" })],
}
const inlineLoaded: LoadedSession = {
  session,
  locators: new Map([[participantId, { storage: "inline" as const, entity }]]),
}
const dungeon = {
  id: "dungeon-1",
  shortId: "dng-1",
  campaignId: row.campaignId,
  mapInstanceId: row.mapInstanceId,
  status: "active",
  state: {
    turnCounter: 2,
    actedCharacterIds: [],
    reminderSettings: {
      randomEncounters: { enabled: false, intervalTurns: 6 },
    },
    generation: {
      seed: "",
      streamCursors: {},
      declarations: [],
      mintedUniqueKeys: [],
      mints: {},
    },
  },
  version: 9,
} as unknown as DungeonRow
const encounterEvidence = {
  row,
  loaded: inlineLoaded,
  durableVersions: new Map(),
  durableRevisions: new Map(),
}
const tx = {} as Parameters<typeof combatWriteCommand.execute>[0]["tx"]
const args = {
  encounterId: row.id,
  participantId,
  write: { component: "vitals", op: "damage", amount: 2 } as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  loadCampaignRowById.mockResolvedValue({ dmUserId: actor.userId })
  loadPlayerCharacterById.mockResolvedValue({ entity, userId: actor.userId })
  authorizeEntityWrite.mockResolvedValue(ok(undefined))
  saveEncounterSession.mockResolvedValue(ok({ version: 4 }))
  setEncounterStatus.mockResolvedValue(ok({ version: 5 }))
  loadDungeonRowByMapInstanceId.mockResolvedValue(null)
  lockDungeonRowForMutation.mockResolvedValue(ok(dungeon))
  loadMapInstanceById.mockResolvedValue({
    id: row.mapInstanceId,
    state: {
      geometry: { pages: {}, zones: {}, connections: {} },
      occupancy: {},
      enchantment: null,
      reveal: {
        revealedZoneIds: [],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
      generation: makeGenerationState(),
      lastMovedTokenKey: null,
    },
    version: 7,
  })
  saveMapInstanceState.mockResolvedValue(ok({ version: 8 }))
  saveDungeonState.mockResolvedValue(ok({ version: 10 }))
})

describe("combat.event command", () => {
  it("stamps encounter and map-instance axes when a roster add also places the token", async () => {
    const addedId = asParticipantId("participant-2")
    const eventArgs = {
      encounterId: row.id,
      event: {
        kind: "addParticipant" as const,
        setup: {
          id: addedId,
          side: "enemies" as const,
          zoneId: "zone-1",
          entity: { id: "enemy-2", components: { identity: { name: "Imp" } } },
        },
      },
    }
    const stamp = createStampAccumulator()

    const decision = await combatEventCommand.execute({
      tx,
      actor,
      args: eventArgs,
      evidence: {
        ...encounterEvidence,
        loaded: {
          ...inlineLoaded,
          locators: new Map(inlineLoaded.locators),
        },
      },
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(stamp.accepted().revisions).toEqual({
      [encounterAxis(row.id)]: 4,
      [mapInstanceAxis(row.mapInstanceId)]: 8,
    })
  })

  it("stamps the encounter axis for a session-only event", async () => {
    const stamp = createStampAccumulator()

    const decision = await combatEventCommand.execute({
      tx,
      actor,
      args: {
        encounterId: row.id,
        event: { kind: "endTurn" },
      },
      evidence: encounterEvidence,
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(stamp.accepted().revisions).toEqual({
      [encounterAxis(row.id)]: 4,
    })
  })

  it("derives authoritative reducer ids from the package mutation identity", async () => {
    const stamp = createStampAccumulator()

    const decision = await combatEventCommand.execute({
      tx,
      actor,
      args: {
        encounterId: row.id,
        event: { kind: "addZone", name: "Arena" },
      },
      evidence: encounterEvidence,
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(saveMapInstanceState.mock.calls[0]?.[2]).toMatchObject({
      geometry: {
        zones: {
          [`${mutationId}:0`]: expect.objectContaining({ name: "Arena" }),
        },
      },
    })
  })
})

describe("combat.end command", () => {
  const endArgs = { encounterId: row.id }

  it("derives dungeon ownership and reacquires encounter evidence after the dungeon lock", async () => {
    loadEncounterForWrite.mockResolvedValue(ok(encounterEvidence))
    loadDungeonRowByMapInstanceId.mockResolvedValue(dungeon)

    const admitted = await combatEndCommand.admit({ tx, actor, args: endArgs })

    expect(admitted).toMatchObject({
      kind: "allowed",
      evidence: { dungeon: { id: dungeon.id } },
    })
    expect(lockDungeonRowForMutation).toHaveBeenCalledWith(tx, dungeon.id)
    expect(loadEncounterForWrite).toHaveBeenCalledTimes(2)
    expect(lockDungeonRowForMutation.mock.invocationCallOrder[0]).toBeLessThan(
      loadEncounterForWrite.mock.invocationCallOrder[1]!
    )
  })

  it("stamps exactly encounter and map-instance for standalone combat", async () => {
    const stamp = createStampAccumulator()

    const decision = await combatEndCommand.execute({
      tx,
      actor,
      args: endArgs,
      evidence: { encounter: encounterEvidence, dungeon: null },
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(stamp.accepted().revisions).toEqual({
      [encounterAxis(row.id)]: 5,
      [mapInstanceAxis(row.mapInstanceId)]: 8,
    })
  })

  it("stamps the final encounter revision plus map-instance and dungeon", async () => {
    const stamp = createStampAccumulator()

    const decision = await combatEndCommand.execute({
      tx,
      actor,
      args: endArgs,
      evidence: { encounter: encounterEvidence, dungeon },
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(setEncounterStatus).toHaveBeenCalledWith(row.id, "ended", 4, tx)
    expect(stamp.accepted().revisions).toEqual({
      [encounterAxis(row.id)]: 5,
      [mapInstanceAxis(row.mapInstanceId)]: 8,
      [dungeonAxis(dungeon.id)]: 10,
    })
  })

  it("turns a second-row race into contention before exposing a partial stamp", async () => {
    setEncounterStatus.mockResolvedValue(err("stale"))
    const stamp = createStampAccumulator()

    await expect(
      combatEndCommand.execute({
        tx,
        actor,
        args: endArgs,
        evidence: { encounter: encounterEvidence, dungeon },
        stamp,
        mutationId,
      })
    ).rejects.toBeInstanceOf(MutationContentionError)
    expect(stamp.accepted().revisions).toEqual({})
    expect(saveDungeonState).not.toHaveBeenCalled()
  })
})

describe("combat registered command", () => {
  it("routes from the trusted locator and authorizes the inline home", async () => {
    loadEncounterForWrite.mockResolvedValue(
      ok({
        row,
        loaded: inlineLoaded,
        durableVersions: new Map(),
        durableRevisions: new Map(),
      })
    )

    const admitted = await combatWriteCommand.admit({
      tx,
      actor,
      args,
    })

    expect(admitted).toMatchObject({
      kind: "allowed",
      evidence: { found: true, storage: "inline" },
    })
    expect(loadCampaignRowById).toHaveBeenCalledWith(row.campaignId, tx)
    expect(commitEntityWrite).not.toHaveBeenCalled()
  })

  it("denies a missing target during pre-receipt screening", async () => {
    loadEncounterForWrite.mockResolvedValue(err("encounter-not-found"))

    await expect(
      combatWriteCommand.screen({ executor: tx, actor, args })
    ).resolves.toEqual({ kind: "denied" })
  })

  it("records participant-not-found when an authorized DM writes a removed participant", async () => {
    loadEncounterForWrite.mockResolvedValue(
      ok({
        row,
        loaded: {
          session: { ...session, participants: [] },
          locators: new Map(),
        },
        durableVersions: new Map(),
        durableRevisions: new Map(),
      })
    )

    const admitted = await combatWriteCommand.admit({
      tx,
      actor,
      args,
    })
    if (admitted.kind !== "allowed") throw new Error("expected admission")

    await expect(
      combatWriteCommand.execute({
        tx,
        actor,
        args,
        evidence: admitted.evidence,
        stamp: createStampAccumulator(),
        mutationId,
      })
    ).resolves.toEqual({
      kind: "refused",
      error: "participant-not-found",
    })
    expect(saveEncounterSession).not.toHaveBeenCalled()
    expect(commitEntityWrite).not.toHaveBeenCalled()
  })

  it("denies an unauthorized caller when the participant is missing", async () => {
    loadEncounterForWrite.mockResolvedValue(
      ok({
        row,
        loaded: {
          session: { ...session, participants: [] },
          locators: new Map(),
        },
        durableVersions: new Map(),
        durableRevisions: new Map(),
      })
    )
    loadCampaignRowById.mockResolvedValue({ dmUserId: "another-user" })

    await expect(
      combatWriteCommand.admit({ tx, actor, args })
    ).resolves.toEqual({ kind: "denied" })
  })

  it("commits an inline write against the attempt version and stamps exactly the encounter axis", async () => {
    const stamp = createStampAccumulator()

    const decision = await combatWriteCommand.execute({
      tx,
      actor,
      args,
      evidence: {
        found: true,
        storage: "inline",
        row,
        loaded: inlineLoaded,
        participantId,
      },
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(saveEncounterSession).toHaveBeenCalledWith(
      row.id,
      expect.anything(),
      row.version,
      tx
    )
    expect(stamp.accepted().revisions).toEqual({ [encounterAxis(row.id)]: 4 })
  })

  it("turns a lost inline guard race into authority contention", async () => {
    saveEncounterSession.mockResolvedValue(err("stale"))

    await expect(
      combatWriteCommand.execute({
        tx,
        actor,
        args,
        evidence: {
          found: true,
          storage: "inline",
          row,
          loaded: inlineLoaded,
          participantId,
        },
        stamp: createStampAccumulator(),
        mutationId,
      })
    ).rejects.toBeInstanceOf(MutationContentionError)
  })

  it("records Writer refusal without attempting persistence", async () => {
    const refusalArgs = {
      ...args,
      write: { component: "skillPool", op: "damage", amount: 1 } as const,
    }

    const decision = await combatWriteCommand.execute({
      tx,
      actor,
      args: refusalArgs,
      evidence: {
        found: true,
        storage: "inline",
        row,
        loaded: inlineLoaded,
        participantId,
      },
      stamp: createStampAccumulator(),
      mutationId,
    })

    expect(decision).toEqual({ kind: "refused", error: "capability-missing" })
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("uses the composed durable Store and preserves its accepted stamp", async () => {
    commitEntityWrite.mockImplementation(async (_tx, _actor, input, stamp) => {
      stamp.record(entityVitalsAxis(input.entityId), 7)
      return ok({ version: 7, versionClass: "vitals", shortId: "pc" })
    })
    const stamp = createStampAccumulator()

    const decision = await combatWriteCommand.execute({
      tx,
      actor,
      args,
      evidence: {
        found: true,
        storage: "durable",
        row,
        entityId: "entity-1",
      },
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(commitEntityWrite).toHaveBeenCalledWith(
      tx,
      actor,
      { entityId: "entity-1", write: args.write },
      stamp
    )
    expect(
      revisionAt(stamp.accepted().revisions, entityVitalsAxis("entity-1"))
    ).toBe(7)
  })

  it("revalidates the accepted encounter projection", async () => {
    const stamp = createStampAccumulator()
    stamp.record(encounterAxis(row.id), 4)

    await combatWriteCommand.finalizeAccepted({
      actor,
      args,
      stamp: stamp.accepted(),
      projection: {
        id: row.id,
        shortId: row.shortId,
        status: row.status,
      },
    })

    expect(revalidateEncounter).toHaveBeenCalledWith({
      id: row.id,
      shortId: row.shortId,
      status: row.status,
    })
  })
})
