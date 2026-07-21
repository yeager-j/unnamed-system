import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

import { entityIdentityAxis } from "@/lib/db/axes"

// The door's collaborators are stubbed so this is a pure unit of the
// parse → authenticate → pre-authorize → execute → finalize orchestration.
const requireActor = vi.fn()
const requireEntityOwner = vi.fn()
const executeEntityMutation = vi.fn()
const revalidateCharacterList = vi.fn()
const publishCharacterPing = vi.fn()
const forbidden = vi.fn(() => {
  throw new Error("forbidden")
})

vi.mock("next/navigation", () => ({ forbidden: () => forbidden() }))
vi.mock("@/lib/auth/actor", () => ({ requireActor: () => requireActor() }))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireEntityOwner: (entityId: string) => requireEntityOwner(entityId),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: (shortId: string, kind: string, versions: unknown) =>
    publishCharacterPing(shortId, kind, versions),
}))
vi.mock("../authorize-write", () => ({
  isEntityWriteAuthRejection: (rejection: string) =>
    rejection === "unauthorized",
}))
vi.mock("./executor", () => ({
  executeEntityMutation: (envelope: unknown, actor: unknown) =>
    executeEntityMutation(envelope, actor),
}))
vi.mock("../revalidate", () => ({
  revalidateCharacterList: () => revalidateCharacterList(),
}))

const { applyIdentityWriteAction } = await import("./apply-identity")

const ENTITY_ID = "e1"
const ACTOR = { userId: "user-1", email: "user-1@example.com" }

function input(write: unknown) {
  return { entityId: ENTITY_ID, write }
}

function acceptedAt(version: number) {
  return ok({
    kind: "accepted",
    stamp: { revisions: { [entityIdentityAxis(ENTITY_ID)]: version } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireActor.mockResolvedValue(ACTOR)
  requireEntityOwner.mockResolvedValue({ entity: { shortId: "s1" } })
  executeEntityMutation.mockResolvedValue(acceptedAt(4))
})

describe("applyIdentityWriteAction", () => {
  it("sends one envelope carrying the protocol, a fresh id, and the invocation", async () => {
    const result = await applyIdentityWriteAction(
      input({ field: "name", value: "  Vela  " })
    )

    expect(result).toEqual(ok({ version: 4 }))
    const [envelope, actor] = executeEntityMutation.mock.calls[0]!
    expect(actor).toBe(ACTOR)
    expect(envelope).toMatchObject({
      protocol: "showtime.entity.v1",
      invocation: {
        name: "entity.identity",
        // Parsed args ride the wire: the name is already trimmed, and nothing
        // else the caller sent survives.
        args: { entityId: ENTITY_ID, write: { field: "name", value: "Vela" } },
      },
    })
    expect(envelope.mutationId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("allocates a distinct mutation id per settled edit", async () => {
    await applyIdentityWriteAction(input({ field: "name", value: "Vela" }))
    await applyIdentityWriteAction(input({ field: "name", value: "Velaa" }))

    const ids = executeEntityMutation.mock.calls.map(
      ([envelope]) => envelope.mutationId
    )
    expect(new Set(ids).size).toBe(2)
  })

  it("rejects an invalid descriptor before authenticating or executing", async () => {
    const result = await applyIdentityWriteAction(input({ field: "level" }))

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireActor).not.toHaveBeenCalled()
    expect(executeEntityMutation).not.toHaveBeenCalled()
  })

  it("throws (never executes) when unauthenticated", async () => {
    requireActor.mockRejectedValue(new Error("unauthorized"))

    await expect(
      applyIdentityWriteAction(input({ field: "name", value: "Vela" }))
    ).rejects.toThrow("unauthorized")
    expect(executeEntityMutation).not.toHaveBeenCalled()
  })

  it("pre-checks ownership before the executor claims a receipt", async () => {
    const order: string[] = []
    requireEntityOwner.mockImplementation(async () => {
      order.push("owner")
      return { entity: { shortId: "s1" } }
    })
    executeEntityMutation.mockImplementation(async () => {
      order.push("execute")
      return acceptedAt(4)
    })

    await applyIdentityWriteAction(input({ field: "notes", value: "hi" }))

    expect(order).toEqual(["owner", "execute"])
    expect(requireEntityOwner).toHaveBeenCalledWith(ENTITY_ID)
  })

  it("translates an in-handler authorization refusal back to forbidden()", async () => {
    executeEntityMutation.mockResolvedValue(
      ok({ kind: "rejected", error: "unauthorized" })
    )

    await expect(
      applyIdentityWriteAction(input({ field: "name", value: "Vela" }))
    ).rejects.toThrow("forbidden")
    expect(forbidden).toHaveBeenCalledOnce()
  })

  it("reports exhausted contention as its own outcome, never as a stale conflict", async () => {
    executeEntityMutation.mockResolvedValue({
      ok: false,
      error: { code: "contention", mutationId: "m1" },
    })

    const result = await applyIdentityWriteAction(
      input({ field: "name", value: "Vela" })
    )

    expect(result).toEqual({ ok: false, error: "contention" })
    expect(publishCharacterPing).not.toHaveBeenCalled()
  })

  it("revalidates the character list only for the summary-bearing columns", async () => {
    await applyIdentityWriteAction(input({ field: "name", value: "Vela" }))
    expect(revalidateCharacterList).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    requireActor.mockResolvedValue(ACTOR)
    requireEntityOwner.mockResolvedValue({ entity: { shortId: "s1" } })
    executeEntityMutation.mockResolvedValue(acceptedAt(5))

    await applyIdentityWriteAction(input({ field: "notes", value: "hi" }))
    expect(revalidateCharacterList).not.toHaveBeenCalled()
  })

  it("pings the un-migrated provider with the stamped identity revision", async () => {
    await applyIdentityWriteAction(input({ field: "notes", value: "hi" }))

    expect(publishCharacterPing).toHaveBeenCalledWith("s1", "entity", {
      identity: 4,
    })
  })

  /**
   * The negative control for AC #1: the door reads the client's new version out of
   * the accepted stamp, which is the same vector the executor expires cache tags
   * and publishes invalidations from. An acceptance that stamped no identity axis
   * would mean neither happened, so it must fail loudly rather than return a
   * plausible `undefined`.
   */
  it("throws when an acceptance did not stamp the identity axis", async () => {
    executeEntityMutation.mockResolvedValue(
      ok({ kind: "accepted", stamp: { revisions: {} } })
    )

    await expect(
      applyIdentityWriteAction(input({ field: "name", value: "Vela" }))
    ).rejects.toThrow("without stamping the identity axis")
  })
})
