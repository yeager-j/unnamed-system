import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeParticipant,
  type LoadedSession,
  type Session,
} from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { createStampAccumulator, revisionAt } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { err, ok } from "@workspace/result"

import { encounterAxis, entityVitalsAxis } from "@/lib/db/axes"
import type { EncounterRow } from "@/lib/db/schema/encounter"

const loadEncounterForWrite = vi.fn()
const loadCampaignRowById = vi.fn()
const loadPlayerCharacterById = vi.fn()
const authorizeEntityWrite = vi.fn()
const commitEntityWrite = vi.fn()
const saveEncounterSession = vi.fn()
const publishEncounterPing = vi.fn()
const revalidateEncounter = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForWrite: (...args: unknown[]) => loadEncounterForWrite(...args),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignRowById: (...args: unknown[]) => loadCampaignRowById(...args),
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
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (...args: unknown[]) => publishEncounterPing(...args),
}))
vi.mock("../../encounter/revalidate", () => ({
  revalidateEncounter: (...args: unknown[]) => revalidateEncounter(...args),
}))

const { combatWriteCommand } = await import("./commands")

const participantId = asParticipantId("participant-1")
const actor = { userId: "dm-1", email: "dm@example.com" }
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
      executor: tx,
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

  it("denies a missing target before creating a receipt", async () => {
    loadEncounterForWrite.mockResolvedValue(err("encounter-not-found"))

    await expect(
      combatWriteCommand.admit({ executor: tx, actor, args })
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
      executor: tx,
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
      combatWriteCommand.admit({ executor: tx, actor, args })
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
    })

    expect(decision).toEqual({ kind: "refused", error: "capability-missing" })
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("uses the composed durable Store and preserves its accepted stamp", async () => {
    commitEntityWrite.mockImplementation(async (_tx, _actor, input, stamp) => {
      const parsed = await import("@workspace/headcanon").then(({ revision }) =>
        revision(7)
      )
      if (!parsed.ok) throw new Error("invalid fixture revision")
      stamp.record(entityVitalsAxis(input.entityId), parsed.value)
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

  it("retains only the inline encounter ping after acceptance", async () => {
    const stamp = createStampAccumulator()
    const parsed = await import("@workspace/headcanon").then(({ revision }) =>
      revision(4)
    )
    if (!parsed.ok) throw new Error("invalid fixture revision")
    stamp.record(encounterAxis(row.id), parsed.value)

    await combatWriteCommand.afterAccepted({
      actor,
      args,
      stamp: stamp.accepted(),
      preflight: {
        found: true,
        storage: "inline",
        row,
        loaded: inlineLoaded,
        participantId,
      },
    })

    expect(publishEncounterPing).toHaveBeenCalledWith(row.shortId, {
      version: 4,
      status: row.status,
    })
    expect(revalidateEncounter).toHaveBeenCalledWith(row)
  })
})
