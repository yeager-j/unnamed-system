import { afterEach, describe, expect, it, vi } from "vitest"

import type { ReplicaEvent } from "@workspace/replica"

import { logEntityReplicaEvent } from "./events"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("logEntityReplicaEvent", () => {
  it.each<ReplicaEvent>([
    {
      kind: "retried",
      id: 2,
      name: "entity.write",
      remaining: 1,
    },
    { kind: "conflict", id: 3, name: "entity.setColumn" },
    { kind: "snapshot", through: 4, replayed: 2 },
    { kind: "expired", dropped: 1 },
  ])("warns with the structured $kind anomaly", (event) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    logEntityReplicaEvent(event)

    expect(warn).toHaveBeenCalledWith(
      "[entity-replica-client]",
      JSON.stringify(event)
    )
  })

  it.each<ReplicaEvent>([
    { kind: "assigned", id: 1, name: "entity.write" },
    { kind: "snapshot", through: 1, replayed: 0 },
    { kind: "connection", status: "connected" },
  ])("keeps routine $kind traffic quiet", (event) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    logEntityReplicaEvent(event)

    expect(warn).not.toHaveBeenCalled()
  })
})
