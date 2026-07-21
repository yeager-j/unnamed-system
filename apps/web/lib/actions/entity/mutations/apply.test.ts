import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

// The door's collaborators are stubbed so this is a pure unit of the
// authenticate → authorize → execute → revalidate orchestration (AC #5).
const requireActor = vi.fn()
const authorizeEntityWrite = vi.fn()
const parseEntityWriteTarget = vi.fn()
const executeEntityMutation = vi.fn()
const revalidateCharacterList = vi.fn()

vi.mock("@/lib/auth/actor", () => ({
  requireActor: () => requireActor(),
}))
vi.mock("./authorize", () => ({
  authorizeEntityWrite: (target: unknown) => authorizeEntityWrite(target),
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

const ACTOR = { userId: "user-1" }

function target(component: string) {
  return { entityId: "e1", write: { component, op: "damage", amount: 1 } }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireActor.mockResolvedValue(ACTOR)
  executeEntityMutation.mockResolvedValue(
    ok({ kind: "accepted", stamp: { revisions: {} } })
  )
})

describe("applyEntityMutationAction (AC #5)", () => {
  it("authenticates, then authorizes the parsed target before executing", async () => {
    const order: string[] = []
    requireActor.mockImplementation(async () => {
      order.push("actor")
      return ACTOR
    })
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    authorizeEntityWrite.mockImplementation(async () => {
      order.push("authorize")
    })
    executeEntityMutation.mockImplementation(async () => {
      order.push("execute")
      return ok({ kind: "accepted", stamp: { revisions: {} } })
    })

    await applyEntityMutationAction({})

    expect(order).toEqual(["actor", "authorize", "execute"])
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

    expect(authorizeEntityWrite).not.toHaveBeenCalled()
    expect(executeEntityMutation).toHaveBeenCalledOnce()
  })

  it("revalidates the character list only for level and archetype writes", async () => {
    parseEntityWriteTarget.mockReturnValue(target("level"))
    await applyEntityMutationAction({})
    expect(revalidateCharacterList).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    requireActor.mockResolvedValue(ACTOR)
    executeEntityMutation.mockResolvedValue(
      ok({ kind: "accepted", stamp: { revisions: {} } })
    )
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    await applyEntityMutationAction({})
    expect(revalidateCharacterList).not.toHaveBeenCalled()
  })
})
