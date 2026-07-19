import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { CombatDurablePushContext } from "./durable-processor"
import {
  pushCombatDurableMutationAction,
  pushCombatSessionMutationAction,
} from "./push"
import type { CombatSessionPushContext } from "./session-processor"

/**
 * The push doors' own responsibilities (UNN-646): wire parse, the
 * outside-the-transaction TYPED authorization verdict, and the
 * committed-only side effects — never for a deduplicated replay.
 * Ordering/dedup/recording semantics live in `@workspace/replica`'s law
 * suites; the processors are stubbed.
 */
const authorizeEntityWriteForClass = vi.fn()
const authorizeCampaignDMForEncounter = vi.fn()
const durableProcessor = vi.fn()
const sessionProcessor = vi.fn()
const publishCharacterPing = vi.fn()
const publishEncounterPing = vi.fn()
const revalidateEntity = vi.fn()
const revalidateEncounter = vi.fn()
const loadEncounterEnvelopeById = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  authorizeEntityWriteForClass: (id: string, cls: string) =>
    authorizeEntityWriteForClass(id, cls),
  authorizeCampaignDMForEncounter: (id: string) =>
    authorizeCampaignDMForEncounter(id),
}))
vi.mock("./durable-processor", () => ({
  createCombatDurablePushProcessor: () => durableProcessor,
}))
vi.mock("./session-processor", () => ({
  createCombatSessionPushProcessor: () => sessionProcessor,
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: (shortId: string, kind: string, versions: unknown) =>
    publishCharacterPing(shortId, kind, versions),
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
}))
vi.mock("../../encounter/revalidate", () => ({
  revalidateEncounter: (row: unknown) => revalidateEncounter(row),
}))
vi.mock("../../entity/revalidate", () => ({
  revalidateEntity: (row: unknown) => revalidateEntity(row),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterEnvelopeById: (id: string) => loadEncounterEnvelopeById(id),
}))

const pc = { userId: "owner", campaignId: "c1" }
const encounterEnvelope = {
  id: "enc1",
  shortId: "es1",
  campaignId: "c1",
  status: "live",
}

const vitalsWrite = { component: "vitals", op: "damage", amount: 3 }

const durableInput = (args: unknown, mutationId = 1) => ({
  encounterId: "enc1",
  entityId: "e1",
  envelope: {
    clientGroupId: "combat-entity:e1",
    clientId: "tab-1",
    mutationId,
    invocation: { name: "combat.entity.write", args },
  },
})

const sessionInput = (mutationId = 1) => ({
  encounterId: "enc1",
  envelope: {
    clientGroupId: "combat-session:enc1",
    clientId: "tab-1",
    mutationId,
    invocation: {
      name: "combat.session.write",
      args: { participantId: "p-goblin", write: vitalsWrite },
    },
  },
})

beforeEach(() => {
  authorizeEntityWriteForClass.mockReset().mockResolvedValue(ok(pc))
  authorizeCampaignDMForEncounter
    .mockReset()
    .mockResolvedValue(ok(encounterEnvelope))
  durableProcessor.mockReset().mockResolvedValue(ok(undefined))
  sessionProcessor.mockReset().mockResolvedValue(ok({ version: 5 }))
  publishCharacterPing.mockReset()
  publishEncounterPing.mockReset()
  revalidateEntity.mockReset()
  revalidateEncounter.mockReset()
  loadEncounterEnvelopeById.mockReset().mockResolvedValue(encounterEnvelope)
})

describe("pushCombatDurableMutationAction", () => {
  it("refuses a malformed transport shape before any work", async () => {
    const result = await pushCombatDurableMutationAction({
      entityId: "e1",
    } as never)
    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(durableProcessor).not.toHaveBeenCalled()
  })

  it("delivers the envelope with the class-posture verdict for the write's own class", async () => {
    await pushCombatDurableMutationAction(durableInput(vitalsWrite))

    expect(authorizeEntityWriteForClass).toHaveBeenCalledWith("e1", "vitals")
    const [envelope, context] = durableProcessor.mock.calls[0] as [
      unknown,
      CombatDurablePushContext,
    ]
    expect(envelope).toEqual(durableInput(vitalsWrite).envelope)
    expect(context.entityId).toBe("e1")
    expect(context.authorization).toEqual(ok(pc))
  })

  it("fails the verdict closed on a non-combat arm without touching the gate", async () => {
    await pushCombatDurableMutationAction(
      durableInput({ component: "rest", op: "fullRest" })
    )

    expect(authorizeEntityWriteForClass).not.toHaveBeenCalled()
    const [, context] = durableProcessor.mock.calls[0] as [
      unknown,
      CombatDurablePushContext,
    ]
    expect(context.authorization).toEqual(err("forbidden"))
  })

  it("pings the character channel and revalidates encounter + entity on a real commit", async () => {
    durableProcessor.mockImplementation(
      (_envelope: unknown, context: CombatDurablePushContext) => {
        context.committed = {
          shortId: "s1",
          durableClass: "vitals",
          version: 9,
        }
        return Promise.resolve(ok(undefined))
      }
    )

    const result = await pushCombatDurableMutationAction(
      durableInput(vitalsWrite)
    )

    expect(result).toEqual(ok(undefined))
    expect(publishCharacterPing).toHaveBeenCalledWith("s1", "entity", {
      vitals: 9,
    })
    expect(revalidateEntity).toHaveBeenCalledWith({ shortId: "s1" })
    expect(revalidateEncounter).toHaveBeenCalledWith(encounterEnvelope)
  })

  it("skips the encounter revalidation when the claimed encounter is not in the PC's campaign", async () => {
    loadEncounterEnvelopeById.mockResolvedValue({
      ...encounterEnvelope,
      campaignId: "other-campaign",
    })
    durableProcessor.mockImplementation(
      (_envelope: unknown, context: CombatDurablePushContext) => {
        context.committed = {
          shortId: "s1",
          durableClass: "vitals",
          version: 9,
        }
        return Promise.resolve(ok(undefined))
      }
    )

    await pushCombatDurableMutationAction(durableInput(vitalsWrite))

    expect(publishCharacterPing).toHaveBeenCalled()
    expect(revalidateEncounter).not.toHaveBeenCalled()
  })

  it("stays silent for a deduplicated replay — recorded outcome, no new commit", async () => {
    const result = await pushCombatDurableMutationAction(
      durableInput(vitalsWrite)
    )
    expect(result).toEqual(ok(undefined))
    expect(publishCharacterPing).not.toHaveBeenCalled()
    expect(revalidateEncounter).not.toHaveBeenCalled()
  })

  it("passes the processor's refusal through verbatim, without side effects", async () => {
    durableProcessor.mockResolvedValue(
      err({ kind: "gap", expected: 2, received: 5 })
    )

    const result = await pushCombatDurableMutationAction(
      durableInput(vitalsWrite, 5)
    )

    expect(result).toEqual(err({ kind: "gap", expected: 2, received: 5 }))
    expect(publishCharacterPing).not.toHaveBeenCalled()
  })
})

describe("pushCombatSessionMutationAction", () => {
  it("refuses a malformed transport shape before any work", async () => {
    const result = await pushCombatSessionMutationAction({
      encounterId: "enc1",
    } as never)
    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(sessionProcessor).not.toHaveBeenCalled()
  })

  it("delivers the envelope with the campaign-DM verdict", async () => {
    const result = await pushCombatSessionMutationAction(sessionInput())

    expect(authorizeCampaignDMForEncounter).toHaveBeenCalledWith("enc1")
    const [envelope, context] = sessionProcessor.mock.calls[0] as [
      unknown,
      CombatSessionPushContext,
    ]
    expect(envelope).toEqual(sessionInput().envelope)
    expect(context.encounterId).toBe("enc1")
    expect(result).toEqual(ok({ version: 5 }))
  })

  it("still delivers a refused verdict so the refusal is RECORDED, not thrown", async () => {
    authorizeCampaignDMForEncounter.mockResolvedValue(err("forbidden"))
    sessionProcessor.mockResolvedValue(
      err({ kind: "rejected", error: "forbidden" })
    )

    const result = await pushCombatSessionMutationAction(sessionInput())

    const [, context] = sessionProcessor.mock.calls[0] as [
      unknown,
      CombatSessionPushContext,
    ]
    expect(context.authorization).toEqual(err("forbidden"))
    expect(result).toEqual(err({ kind: "rejected", error: "forbidden" }))
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })

  it("pings the encounter channel and revalidates on a real commit, returning the recorded Remote", async () => {
    sessionProcessor.mockImplementation(
      (_envelope: unknown, context: CombatSessionPushContext) => {
        context.committed = { shortId: "es1", status: "live", version: 7 }
        return Promise.resolve(ok({ version: 7 }))
      }
    )

    const result = await pushCombatSessionMutationAction(sessionInput())

    expect(result).toEqual(ok({ version: 7 }))
    expect(publishEncounterPing).toHaveBeenCalledWith("es1", {
      version: 7,
      status: "live",
    })
    expect(revalidateEncounter).toHaveBeenCalledWith(encounterEnvelope)
  })

  it("returns the recorded Remote for a deduplicated replay without side effects", async () => {
    const result = await pushCombatSessionMutationAction(sessionInput())

    expect(result).toEqual(ok({ version: 5 }))
    expect(publishEncounterPing).not.toHaveBeenCalled()
    expect(revalidateEncounter).not.toHaveBeenCalled()
  })
})
