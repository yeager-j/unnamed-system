import { beforeEach, describe, expect, it, vi } from "vitest"

import { emptyMapInstance } from "@workspace/game-v2/spatial"
import type { MutationEnvelope } from "@workspace/replica"
import { err, ok } from "@workspace/result"

import type { MapInstanceInvocation } from "@/domain/map/replica/mutations"

import { createMapInstanceReplicaSource } from "./map-instance-replica-source"

const pushMapInstanceMutationAction = vi.fn()
const loadMapInstanceAcceptedAction = vi.fn()

vi.mock("@/lib/actions/map-instance/replica/push", () => ({
  pushMapInstanceMutationAction: (input: unknown) =>
    pushMapInstanceMutationAction(input),
}))
vi.mock("@/lib/actions/map-instance/replica/snapshot", () => ({
  loadMapInstanceAcceptedAction: (input: unknown) =>
    loadMapInstanceAcceptedAction(input),
}))

const identity = {
  clientGroupId: "map-instance:mi-1",
  clientId: "tab-1",
}
const envelope = {
  ...identity,
  mutationId: 1,
  invocation: {
    name: "map.instance.intent",
    args: { event: { kind: "renameZone", zoneId: "a", name: "Atrium" } },
  },
} satisfies MutationEnvelope<MapInstanceInvocation>

beforeEach(() => {
  vi.clearAllMocks()
  pushMapInstanceMutationAction.mockResolvedValue(ok(undefined))
  loadMapInstanceAcceptedAction.mockResolvedValue(
    ok({
      value: { state: emptyMapInstance(), status: "open" },
      through: 0,
      cursor: 0,
    })
  )
})

describe("createMapInstanceReplicaSource", () => {
  it("invalidates after an accepted push so the local log can incorporate", async () => {
    const invalidate = vi.fn()
    const source = createMapInstanceReplicaSource({
      mapInstanceId: "mi-1",
      identity,
      subscribe: () => () => {},
      invalidate,
    })

    expect(
      await source.pushEnvelope(envelope, new AbortController().signal)
    ).toEqual(ok(undefined))
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it("does not publish an invalidation for an unrecorded malformed push", async () => {
    pushMapInstanceMutationAction.mockResolvedValue(err("invalid-input"))
    const invalidate = vi.fn()
    const source = createMapInstanceReplicaSource({
      mapInstanceId: "mi-1",
      identity,
      subscribe: () => () => {},
      invalidate,
    })

    const result = await source.pushEnvelope(
      envelope,
      new AbortController().signal
    )
    expect(result.ok).toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
