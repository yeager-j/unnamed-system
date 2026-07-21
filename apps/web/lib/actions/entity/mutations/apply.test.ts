import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

// The door's collaborators are stubbed so this is a pure unit of the
// authenticate → pre-authorize → execute → translate/revalidate orchestration.
const requireActor = vi.fn()
const requireEntityWriteAuthorized = vi.fn()
const parseEntityWriteTarget = vi.fn()
const executeEntityMutation = vi.fn()
const revalidateCharacterList = vi.fn()
const forbidden = vi.fn(() => {
  throw new Error("forbidden")
})

vi.mock("next/navigation", () => ({ forbidden: () => forbidden() }))
vi.mock("@/lib/auth/actor", () => ({
  requireActor: () => requireActor(),
}))
vi.mock("../authorize-write", () => ({
  requireEntityWriteAuthorized: (actor: unknown, id: string, write: unknown) =>
    requireEntityWriteAuthorized(actor, id, write),
  isEntityWriteAuthRejection: (rejection: string) =>
    rejection === "unauthorized" ||
    rejection === "archetype-hidden" ||
    rejection === "archetype-locked",
}))
vi.mock("./authorize", () => ({
  parseEntityWriteTarget: (envelope: unknown) =>
    parseEntityWriteTarget(envelope),
}))
vi.mock("./executor", () => ({
  executeEntityMutation: (envelope: unknown, actor: unknown) =>
    executeEntityMutation(envelope, actor),
}))
vi.mock("../revalidate", () => ({
  revalidateCharacterList: () => revalidateCharacterList(),
}))

const { applyEntityMutationAction } = await import("./apply")

const ACTOR = { userId: "user-1", email: "user-1@example.com" }

function target(component: string) {
  return { entityId: "e1", write: { component, op: "damage", amount: 1 } }
}

const accepted = ok({ kind: "accepted", stamp: { revisions: {} } })

beforeEach(() => {
  vi.clearAllMocks()
  requireActor.mockResolvedValue(ACTOR)
  executeEntityMutation.mockResolvedValue(accepted)
})

describe("applyEntityMutationAction", () => {
  it("authenticates, then pre-authorizes the parsed target before executing", async () => {
    const order: string[] = []
    requireActor.mockImplementation(async () => {
      order.push("actor")
      return ACTOR
    })
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    requireEntityWriteAuthorized.mockImplementation(async () => {
      order.push("authorize")
    })
    executeEntityMutation.mockImplementation(async () => {
      order.push("execute")
      return accepted
    })

    await applyEntityMutationAction({})

    expect(order).toEqual(["actor", "authorize", "execute"])
    expect(requireEntityWriteAuthorized).toHaveBeenCalledWith(
      ACTOR,
      "e1",
      target("vitals").write
    )
    expect(executeEntityMutation).toHaveBeenCalledWith({}, ACTOR)
  })

  it("throws (never executes) when unauthenticated", async () => {
    requireActor.mockRejectedValue(new Error("unauthorized"))

    await expect(applyEntityMutationAction({})).rejects.toThrow("unauthorized")
    expect(executeEntityMutation).not.toHaveBeenCalled()
  })

  it("still executes an unparseable envelope so the executor can reject it", async () => {
    parseEntityWriteTarget.mockReturnValue(null)

    await applyEntityMutationAction({ bad: true })

    expect(requireEntityWriteAuthorized).not.toHaveBeenCalled()
    expect(executeEntityMutation).toHaveBeenCalledOnce()
  })

  it("translates an in-handler authorization refusal back to forbidden()", async () => {
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    executeEntityMutation.mockResolvedValue(
      ok({ kind: "rejected", error: "unauthorized" })
    )

    await expect(applyEntityMutationAction({})).rejects.toThrow("forbidden")
    expect(forbidden).toHaveBeenCalledOnce()
  })

  it("does not forbid an ordinary domain rejection", async () => {
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    executeEntityMutation.mockResolvedValue(
      ok({ kind: "rejected", error: "capability-missing" })
    )

    await applyEntityMutationAction({})

    expect(forbidden).not.toHaveBeenCalled()
  })

  it("revalidates the character list only for level and archetype writes", async () => {
    parseEntityWriteTarget.mockReturnValue(target("level"))
    await applyEntityMutationAction({})
    expect(revalidateCharacterList).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    requireActor.mockResolvedValue(ACTOR)
    executeEntityMutation.mockResolvedValue(accepted)
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    await applyEntityMutationAction({})
    expect(revalidateCharacterList).not.toHaveBeenCalled()
  })
})
