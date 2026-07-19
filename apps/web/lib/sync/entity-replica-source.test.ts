import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import { createEntityReplicaSource } from "./entity-replica-source"

/**
 * The production source's own responsibilities (UNN-645): wire-error →
 * PushError mapping, navigation-throw classification (the guard-write
 * lesson — a rethrow is inert in the detached delivery loop), and push
 * pacing. The Server Actions are stubbed; ordering/dedup semantics live in
 * the package's law suites.
 */
const pushEntityMutationAction = vi.fn()
const loadEntityAcceptedAction = vi.fn()

vi.mock("@/lib/actions/entity/replica/push", () => ({
  pushEntityMutationAction: (input: unknown) => pushEntityMutationAction(input),
}))
vi.mock("@/lib/actions/entity/replica/snapshot", () => ({
  loadEntityAcceptedAction: (input: unknown) => loadEntityAcceptedAction(input),
}))

const identity = { clientGroupId: "entity:e1", clientId: "tab-1" }

function build() {
  return createEntityReplicaSource({
    entityId: "e1",
    identity,
    subscribe: () => () => {},
  })
}

const envelope = (mutationId = 1) => ({
  ...identity,
  mutationId,
  invocation: {
    name: "entity.write",
    args: { component: "vitals", op: "damage", amount: 1 },
  } as const,
})

const signal = () => new AbortController().signal

beforeEach(() => {
  pushEntityMutationAction.mockReset().mockResolvedValue(ok(undefined))
  loadEntityAcceptedAction.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("fetchAccepted", () => {
  it("returns the personalized accepted tuple", async () => {
    const accepted = { value: {}, through: 4, cursor: { vitals: 2 } }
    loadEntityAcceptedAction.mockResolvedValue(ok(accepted))
    const source = build()

    await expect(source.fetchAccepted(signal())).resolves.toBe(accepted)
    expect(loadEntityAcceptedAction).toHaveBeenCalledWith({
      entityId: "e1",
      ...identity,
    })
  })

  it("throws on a refusal — the transport reads a failed fetch as down", async () => {
    loadEntityAcceptedAction.mockResolvedValue(err("entity-load-failed"))
    const source = build()

    await expect(source.fetchAccepted(signal())).rejects.toThrow(
      "entity-load-failed"
    )
  })
})

describe("pushEnvelope error mapping", () => {
  it("delivers the envelope beside its entity and returns ok", async () => {
    const source = build()
    const result = await source.pushEnvelope(envelope(), signal())
    expect(result).toEqual(ok(undefined))
    expect(pushEntityMutationAction).toHaveBeenCalledWith({
      entityId: "e1",
      envelope: envelope(),
    })
  })

  it("passes a terminal rejection through verbatim", async () => {
    pushEntityMutationAction.mockResolvedValue(
      err({ kind: "rejected", error: "capability-missing" })
    )
    const result = await build().pushEnvelope(envelope(), signal())
    expect(result).toEqual(
      err({ kind: "rejected", error: "capability-missing" })
    )
  })

  // RECORDED decode refusals only: these run inside the processor, so the
  // watermark advanced with them and a terminal rejection is honest.
  it.each([
    [{ kind: "invalid" as const, issues: [] }],
    [{ kind: "unknown-mutation" as const, name: "nope" }],
  ])("maps %o to a terminal invalid-write rejection", async (refusal) => {
    pushEntityMutationAction.mockResolvedValue(err(refusal))
    const result = await build().pushEnvelope(envelope(), signal())
    expect(result).toEqual(err({ kind: "rejected", error: "invalid-write" }))
  })

  it.each([
    // UNRECORDED: the door bounced the envelope before the processor opened a
    // transaction, so calling this `rejected` would consume a local mutation
    // ID the authority's watermark never saw and gap the next delivery.
    ["invalid-input" as const],
    [{ kind: "unknown-client" as const, received: 9 }],
    [{ kind: "gap" as const, expected: 3, received: 9 }],
    [{ kind: "outcome-unavailable" as const, mutationId: 2 }],
  ])(
    "collapses the protocol-dead refusal %o to unknown-client",
    async (refusal) => {
      pushEntityMutationAction.mockResolvedValue(err(refusal))
      const result = await build().pushEnvelope(envelope(), signal())
      expect(result).toEqual(err({ kind: "unknown-client" }))
    }
  )

  it("classifies a Next navigation throw as retryable — nothing was recorded (Codex P2, PR #385)", async () => {
    const sentinel = Object.assign(new Error("forbidden"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;403",
    })
    pushEntityMutationAction.mockRejectedValue(sentinel)
    const result = await build().pushEnvelope(envelope(), signal())
    expect(result).toEqual(err({ kind: "retryable", cause: sentinel }))
  })

  it("classifies an ordinary throw as retryable", async () => {
    const cause = new Error("fetch failed")
    pushEntityMutationAction.mockRejectedValue(cause)
    const result = await build().pushEnvelope(envelope(), signal())
    expect(result).toEqual(err({ kind: "retryable", cause }))
  })
})

describe("pushEnvelope pacing", () => {
  it("delays a retry after a retryable failure and clears on success", async () => {
    vi.useFakeTimers()
    const source = build()
    pushEntityMutationAction.mockRejectedValueOnce(new Error("drop"))

    const first = await source.pushEnvelope(envelope(), signal())
    expect(first.ok).toBe(false)

    pushEntityMutationAction.mockResolvedValue(ok(undefined))
    const retry = source.pushEnvelope(envelope(), signal())
    expect(pushEntityMutationAction).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(250)
    await expect(retry).resolves.toEqual(ok(undefined))
    expect(pushEntityMutationAction).toHaveBeenCalledTimes(2)

    // Success cleared the failure count: the next attempt is immediate.
    const next = source.pushEnvelope(envelope(2), signal())
    await vi.advanceTimersByTimeAsync(0)
    await expect(next).resolves.toEqual(ok(undefined))
    expect(pushEntityMutationAction).toHaveBeenCalledTimes(3)
  })

  it("abandons a paced attempt when the signal aborts mid-wait", async () => {
    vi.useFakeTimers()
    const source = build()
    pushEntityMutationAction.mockRejectedValueOnce(new Error("drop"))
    await source.pushEnvelope(envelope(), signal())

    const controller = new AbortController()
    const paced = source.pushEnvelope(envelope(), controller.signal)
    controller.abort()
    await expect(paced).resolves.toEqual(
      err({ kind: "retryable", cause: "aborted" })
    )
    expect(pushEntityMutationAction).toHaveBeenCalledTimes(1)
  })
})
