import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

import { entityAxisFor } from "@/lib/db/axes"

// The door's collaborators are stubbed so this is a pure unit of the
// authenticate → pre-authorize → execute → translate/bridge/revalidate
// orchestration.
const requireActor = vi.fn()
const requireEntityWriteAuthorized = vi.fn()
const requireEntityOwner = vi.fn()
const parseEntityWriteTarget = vi.fn()
const parseIdentityWriteTarget = vi.fn()
const executeEntityMutation = vi.fn()
const revalidateCharacterList = vi.fn()
const revalidateEntity = vi.fn()
const publishCharacterPing = vi.fn()
const forbidden = vi.fn(() => {
  throw new Error("forbidden")
})

vi.mock("next/navigation", () => ({ forbidden: () => forbidden() }))
vi.mock("@/lib/auth/actor", () => ({
  requireActor: () => requireActor(),
}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireEntityOwner: (entityId: string) => requireEntityOwner(entityId),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: (
    shortId: string,
    kind: string,
    versions: Record<string, number>
  ) => publishCharacterPing(shortId, kind, versions),
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
  parseIdentityWriteTarget: (envelope: unknown) =>
    parseIdentityWriteTarget(envelope),
}))
vi.mock("./executor", () => ({
  executeEntityMutation: (envelope: unknown, actor: unknown) =>
    executeEntityMutation(envelope, actor),
}))
vi.mock("../revalidate", () => ({
  revalidateCharacterList: () => revalidateCharacterList(),
  revalidateEntity: (row: { shortId: string }) => revalidateEntity(row),
}))

const { applyEntityMutationAction } = await import("./apply")

const ACTOR = { userId: "user-1", email: "user-1@example.com" }
const PC = { entity: { shortId: "abc123" } }

function target(component: string) {
  return { entityId: "e1", write: { component, op: "damage", amount: 1 } }
}

function identityTarget(field: string) {
  return { entityId: "e1", write: { field, value: "next" } }
}

const accepted = ok({ kind: "accepted", stamp: { revisions: {} } })
const acceptedStamping = (axis: string, revision: number) =>
  ok({ kind: "accepted", stamp: { revisions: { [axis]: revision } } })

beforeEach(() => {
  vi.clearAllMocks()
  requireActor.mockResolvedValue(ACTOR)
  requireEntityWriteAuthorized.mockResolvedValue(PC)
  requireEntityOwner.mockResolvedValue(PC)
  parseEntityWriteTarget.mockReturnValue(null)
  parseIdentityWriteTarget.mockReturnValue(null)
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
      return PC
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

  it("pre-authorizes an identity target through the ownership gate", async () => {
    parseIdentityWriteTarget.mockReturnValue(identityTarget("name"))

    await applyEntityMutationAction({})

    expect(requireEntityOwner).toHaveBeenCalledWith("e1")
    expect(requireEntityWriteAuthorized).not.toHaveBeenCalled()
    expect(executeEntityMutation).toHaveBeenCalledOnce()
  })

  it("throws (never executes) when unauthenticated", async () => {
    requireActor.mockRejectedValue(new Error("unauthorized"))

    await expect(applyEntityMutationAction({})).rejects.toThrow("unauthorized")
    expect(executeEntityMutation).not.toHaveBeenCalled()
  })

  it("still executes an unparseable envelope so the executor can reject it", async () => {
    await applyEntityMutationAction({ bad: true })

    expect(requireEntityWriteAuthorized).not.toHaveBeenCalled()
    expect(requireEntityOwner).not.toHaveBeenCalled()
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

  it("republishes an accepted write's advanced class on the legacy character channel", async () => {
    // Transitional bridge (UNN-676 → deleted in Phase 3a): the combat console
    // and dungeon watch still reconcile via character pings.
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    executeEntityMutation.mockResolvedValue(
      acceptedStamping(entityAxisFor.vitals("e1"), 4)
    )

    await applyEntityMutationAction({})

    expect(publishCharacterPing).toHaveBeenCalledWith("abc123", "entity", {
      vitals: 4,
    })
  })

  it("bridges an accepted identity mutation on its identity class", async () => {
    parseIdentityWriteTarget.mockReturnValue(identityTarget("pronouns"))
    executeEntityMutation.mockResolvedValue(
      acceptedStamping(entityAxisFor.identity("e1"), 9)
    )

    await applyEntityMutationAction({})

    expect(publishCharacterPing).toHaveBeenCalledWith("abc123", "entity", {
      identity: 9,
    })
  })

  it("revalidates the character subtree on acceptance", async () => {
    // The executor's axis finalization cannot reach it: `updateTag` only
    // expires `"use cache"` entries, and the character loader is React
    // `cache()`. Without this, server components deriving props from entity
    // state go stale — the builder's Continue gate stayed disabled for the
    // whole test timeout (caught by e2e/builder.spec.ts).
    parseEntityWriteTarget.mockReturnValue(target("vitals"))

    await applyEntityMutationAction({})

    expect(revalidateEntity).toHaveBeenCalledWith({ shortId: "abc123" })
  })

  it("does not revalidate the character subtree for a rejected outcome", async () => {
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    executeEntityMutation.mockResolvedValue(
      ok({ kind: "rejected", error: "capability-missing" })
    )

    await applyEntityMutationAction({})

    expect(revalidateEntity).not.toHaveBeenCalled()
  })

  it("publishes no ping for a rejected outcome", async () => {
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    executeEntityMutation.mockResolvedValue(
      ok({ kind: "rejected", error: "capability-missing" })
    )

    await applyEntityMutationAction({})

    expect(publishCharacterPing).not.toHaveBeenCalled()
  })

  it("revalidates the character list only for summary-feeding writes", async () => {
    parseEntityWriteTarget.mockReturnValue(target("level"))
    await applyEntityMutationAction({})
    expect(revalidateCharacterList).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    requireActor.mockResolvedValue(ACTOR)
    requireEntityWriteAuthorized.mockResolvedValue(PC)
    executeEntityMutation.mockResolvedValue(accepted)
    parseIdentityWriteTarget.mockReturnValue(null)
    parseEntityWriteTarget.mockReturnValue(target("vitals"))
    await applyEntityMutationAction({})
    expect(revalidateCharacterList).not.toHaveBeenCalled()

    vi.clearAllMocks()
    requireActor.mockResolvedValue(ACTOR)
    requireEntityOwner.mockResolvedValue(PC)
    executeEntityMutation.mockResolvedValue(accepted)
    parseEntityWriteTarget.mockReturnValue(null)
    parseIdentityWriteTarget.mockReturnValue(identityTarget("name"))
    await applyEntityMutationAction({})
    expect(revalidateCharacterList).toHaveBeenCalledOnce()
  })
})
