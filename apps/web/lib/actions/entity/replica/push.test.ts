import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { EntityPushContext } from "./processor"
import { pushEntityMutationAction } from "./push"

/**
 * The push door's own responsibilities (UNN-645): wire parse, the
 * outside-the-transaction authorization verdict, and the committed-only
 * side effects (ping + revalidation, never for a deduplicated replay).
 * Ordering/dedup/recording semantics live in `@workspace/replica`'s law
 * suites and are not re-tested here; the processor is stubbed.
 */
const authorizeEntityWriteForClass = vi.fn()
const checkArchetypeUnlockGates = vi.fn()
const processor = vi.fn()
const publishCharacterPing = vi.fn()
const revalidateEntity = vi.fn()
const revalidateCharacterList = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  authorizeEntityWriteForClass: (id: string, cls: string) =>
    authorizeEntityWriteForClass(id, cls),
}))
vi.mock("../archetype-unlock-gate", () => ({
  checkArchetypeUnlockGates: (id: string, write: unknown) =>
    checkArchetypeUnlockGates(id, write),
}))
vi.mock("./processor", () => ({
  createEntityPushProcessor: (entityId: string) =>
    processor.mockName(`processor(${entityId})`),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: (shortId: string, kind: string, versions: unknown) =>
    publishCharacterPing(shortId, kind, versions),
}))
vi.mock("../revalidate", () => ({
  revalidateEntity: (row: unknown) => revalidateEntity(row),
  revalidateCharacterList: () => revalidateCharacterList(),
}))

const pc = { userId: "owner", entity: { id: "e1" } }

const envelopeFor = (args: unknown, mutationId = 1, name = "entity.write") => ({
  entityId: "e1",
  envelope: {
    clientGroupId: "entity-e1",
    clientId: "tab-1",
    mutationId,
    invocation: { name, args },
  },
})

const vitalsWrite = { component: "vitals", op: "damage", amount: 3 }

beforeEach(() => {
  authorizeEntityWriteForClass.mockReset().mockResolvedValue(ok(pc))
  checkArchetypeUnlockGates.mockReset().mockResolvedValue(ok(undefined))
  processor.mockReset().mockResolvedValue(ok(undefined))
  publishCharacterPing.mockReset()
  revalidateEntity.mockReset()
  revalidateCharacterList.mockReset()
})

describe("pushEntityMutationAction", () => {
  it("refuses a malformed transport shape before any work", async () => {
    const result = await pushEntityMutationAction({
      entityId: "e1",
    } as never)
    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(processor).not.toHaveBeenCalled()
  })

  it("delivers the envelope with an ok authorization verdict for the write's class", async () => {
    await pushEntityMutationAction(envelopeFor(vitalsWrite))

    expect(authorizeEntityWriteForClass).toHaveBeenCalledWith("e1", "vitals")
    const [envelope, context] = processor.mock.calls[0] as [
      unknown,
      EntityPushContext,
    ]
    expect(envelope).toEqual(envelopeFor(vitalsWrite).envelope)
    expect(context.entityId).toBe("e1")
    expect(context.authorization).toEqual(ok(pc))
  })

  it("pings and revalidates exactly the committed write", async () => {
    processor.mockImplementation(
      (_envelope: unknown, context: EntityPushContext) => {
        context.committed = {
          shortId: "s1",
          durableClass: "vitals",
          version: 9,
          revalidateList: false,
        }
        return Promise.resolve(ok(undefined))
      }
    )

    const result = await pushEntityMutationAction(envelopeFor(vitalsWrite))

    expect(result).toEqual(ok(undefined))
    expect(publishCharacterPing).toHaveBeenCalledWith("s1", "entity", {
      vitals: 9,
    })
    expect(revalidateEntity).toHaveBeenCalledWith({ shortId: "s1" })
    expect(revalidateCharacterList).not.toHaveBeenCalled()
  })

  it("revalidates the character list for a roster-summary component", async () => {
    processor.mockImplementation(
      (_envelope: unknown, context: EntityPushContext) => {
        context.committed = {
          shortId: "s1",
          durableClass: "progression",
          version: 2,
          revalidateList: true,
        }
        return Promise.resolve(ok(undefined))
      }
    )

    await pushEntityMutationAction(
      envelopeFor({
        component: "archetypes",
        op: "spendArchetypeRank",
        archetypeKey: "warden",
      })
    )
    expect(revalidateCharacterList).toHaveBeenCalled()
  })

  it("stays silent for a deduplicated replay — recorded outcome, no new commit", async () => {
    processor.mockResolvedValue(ok(undefined))

    const result = await pushEntityMutationAction(envelopeFor(vitalsWrite))

    expect(result).toEqual(ok(undefined))
    expect(publishCharacterPing).not.toHaveBeenCalled()
    expect(revalidateEntity).not.toHaveBeenCalled()
  })

  it("passes the processor's refusal through verbatim, without side effects", async () => {
    processor.mockResolvedValue(err({ kind: "gap", expected: 2, received: 5 }))

    const result = await pushEntityMutationAction(envelopeFor(vitalsWrite, 5))

    expect(result).toEqual(err({ kind: "gap", expected: 2, received: 5 }))
    expect(publishCharacterPing).not.toHaveBeenCalled()
  })

  it("composes an archetype-gate refusal into a forbidden verdict", async () => {
    checkArchetypeUnlockGates.mockResolvedValue(err("forbidden"))

    await pushEntityMutationAction(envelopeFor(vitalsWrite))

    const [, context] = processor.mock.calls[0] as [unknown, EntityPushContext]
    expect(context.authorization).toEqual(err("forbidden"))
  })

  it("fails the verdict closed on unparseable args without touching the gates", async () => {
    await pushEntityMutationAction(envelopeFor({ component: "nope" }))

    expect(authorizeEntityWriteForClass).not.toHaveBeenCalled()
    const [, context] = processor.mock.calls[0] as [unknown, EntityPushContext]
    expect(context.authorization).toEqual(err("forbidden"))
  })

  it("authorizes a column mutation as strict-owner identity intent", async () => {
    await pushEntityMutationAction(
      envelopeFor({ column: "name", value: "Momo" }, 1, "entity.setColumn")
    )

    expect(authorizeEntityWriteForClass).toHaveBeenCalledWith("e1", "identity")
    expect(checkArchetypeUnlockGates).not.toHaveBeenCalled()
  })

  it("revalidates the character list for a committed name column", async () => {
    processor.mockImplementation(
      (_envelope: unknown, context: EntityPushContext) => {
        context.committed = {
          shortId: "s1",
          durableClass: "identity",
          version: 4,
          revalidateList: true,
        }
        return Promise.resolve(ok(undefined))
      }
    )

    await pushEntityMutationAction(
      envelopeFor({ column: "name", value: "Momo" }, 1, "entity.setColumn")
    )

    expect(publishCharacterPing).toHaveBeenCalledWith("s1", "entity", {
      identity: 4,
    })
    expect(revalidateEntity).toHaveBeenCalledWith({ shortId: "s1" })
    expect(revalidateCharacterList).toHaveBeenCalled()
  })
})
