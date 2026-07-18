import { describe, expect, it } from "vitest"

import { eventually } from "./contract/support"
import { createInMemoryAuthority } from "./in-memory-authority"
import { createReplica, type ReplicaEvent } from "./index"
import {
  addEntry,
  dropEntry,
  LEDGER_INITIAL,
  ledgerMutations,
  reserveIfCount,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "./reference/ledger"
import type { ProcessorEvent } from "./server"

const identity = { clientGroupId: "group", clientId: "client-1" }

function build(onEvent?: (event: ReplicaEvent) => void) {
  const events: ReplicaEvent[] = []
  const authority = createInMemoryAuthority<
    Ledger,
    LedgerInvocation,
    LedgerError
  >({ mutations: ledgerMutations, initial: LEDGER_INITIAL })
  const handle = authority.transport(identity)
  const replica = createReplica({
    identity,
    initial: { value: LEDGER_INITIAL, through: 0, cursor: 0 },
    mutations: ledgerMutations,
    transport: handle.transport,
    onEvent:
      onEvent ??
      ((event) => {
        events.push(event)
      }),
  })
  // The in-memory transport's catch-up emission fires during connect; clear it
  // so each test asserts only the events its own scenario produces.
  events.length = 0
  return { authority, handle, replica, events }
}

describe("createReplica onEvent", () => {
  it("emits the mutation lifecycle through incorporation and disposal", async () => {
    const { authority, replica, events } = build()
    const receipt = replica.mutate(addEntry({ entry: "one" }))
    const remote = await receipt.remote
    expect(remote.ok).toBe(true)
    authority.publish()
    replica.dispose()
    expect(events).toEqual([
      { kind: "assigned", id: 1, name: "ledger.add" },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 1 },
      { kind: "settled", id: 1, name: "ledger.add", outcome: "accepted" },
      { kind: "incorporated", id: 1, name: "ledger.add" },
      { kind: "snapshot", through: 1, replayed: 0 },
      { kind: "disposed", pending: 0 },
    ])
  })

  it("emits refused for local refusals, which consume no identity", async () => {
    const { replica, events } = build()
    replica.mutate({
      name: "ledger.add",
      args: { entry: 42 },
    } as unknown as LedgerInvocation)
    const refused = replica.mutate(dropEntry({ entry: "missing" }))
    expect(refused.id).toBeNull()
    expect(events).toEqual([
      { kind: "refused", name: "ledger.add", reason: "invalid" },
      { kind: "refused", name: "ledger.drop", reason: "refused" },
    ])
    replica.dispose()
  })

  it("emits retried with the remaining budget on an ambiguous push", async () => {
    const { authority, replica, events } = build()
    authority.failNextPush(1)
    const receipt = replica.mutate(addEntry({ entry: "one" }))
    const remote = await receipt.remote
    expect(remote.ok).toBe(true)
    expect(events).toEqual([
      { kind: "assigned", id: 1, name: "ledger.add" },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 1 },
      { kind: "retried", id: 1, name: "ledger.add", remaining: 2 },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 2 },
      { kind: "settled", id: 1, name: "ledger.add", outcome: "accepted" },
    ])
    replica.dispose()
  })

  it("emits connection transitions for retry exhaustion and liveness resume", async () => {
    const { authority, handle, replica, events } = build()
    authority.failNextPush(4)
    const receipt = replica.mutate(addEntry({ entry: "one" }))
    await eventually(() => {
      expect(replica.getSnapshot().connection).toBe("disconnected")
    })
    handle.alive()
    const remote = await receipt.remote
    expect(remote.ok).toBe(true)
    expect(events).toEqual([
      { kind: "assigned", id: 1, name: "ledger.add" },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 1 },
      { kind: "retried", id: 1, name: "ledger.add", remaining: 2 },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 2 },
      { kind: "retried", id: 1, name: "ledger.add", remaining: 1 },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 3 },
      { kind: "retried", id: 1, name: "ledger.add", remaining: 0 },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 4 },
      { kind: "connection", status: "disconnected", cause: "retry-exhausted" },
      { kind: "connection", status: "connected" },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 5 },
      { kind: "settled", id: 1, name: "ledger.add", outcome: "accepted" },
    ])
    replica.dispose()
  })

  it("emits connection transitions for transport down and recovery", () => {
    const { handle, replica, events } = build()
    handle.down()
    handle.alive()
    expect(events).toEqual([
      { kind: "connection", status: "disconnected", cause: "transport-down" },
      { kind: "connection", status: "connected" },
    ])
    replica.dispose()
  })

  it("emits settled rejected on a terminal authority rejection", async () => {
    const { authority, replica, events } = build()
    authority.vetoNext({ kind: "vetoed" })
    const receipt = replica.mutate(addEntry({ entry: "one" }))
    const remote = await receipt.remote
    expect(remote.ok).toBe(false)
    expect(events).toEqual([
      { kind: "assigned", id: 1, name: "ledger.add" },
      { kind: "sent", id: 1, name: "ledger.add", attempt: 1 },
      { kind: "settled", id: 1, name: "ledger.add", outcome: "rejected" },
    ])
    replica.dispose()
  })

  it("emits the snapshot's replay count and any replay conflicts", async () => {
    const { authority, replica, events } = build()
    authority.pause()
    replica.mutate(reserveIfCount({ expectedCount: 0, entry: "mine" }))
    await authority.commitExternal(addEntry({ entry: "other" }))
    authority.publish()
    expect(events).toEqual([
      { kind: "assigned", id: 1, name: "ledger.reserve-if-count" },
      { kind: "sent", id: 1, name: "ledger.reserve-if-count", attempt: 1 },
      { kind: "snapshot", through: 0, replayed: 1 },
      { kind: "conflict", id: 1, name: "ledger.reserve-if-count" },
    ])
    replica.dispose()
  })

  it("reports the pending count on disposal", () => {
    const { authority, replica, events } = build()
    authority.pause()
    replica.mutate(addEntry({ entry: "one" }))
    replica.dispose()
    expect(events.at(-1)).toEqual({ kind: "disposed", pending: 1 })
  })

  it("never lets a throwing sink alter mutation outcomes", async () => {
    const { authority, replica } = build(() => {
      throw new Error("bad sink")
    })
    const receipt = replica.mutate(addEntry({ entry: "one" }))
    const remote = await receipt.remote
    expect(remote.ok).toBe(true)
    authority.publish()
    expect(replica.getSnapshot().value).toEqual({ entries: ["one"] })
    replica.dispose()
  })
})

describe("createMutationProcessor onEvent", () => {
  it("emits recorded outcomes, duplicates, gaps, and unavailable outcomes", async () => {
    const events: ProcessorEvent[] = []
    const authority = createInMemoryAuthority<
      Ledger,
      LedgerInvocation,
      LedgerError
    >({
      mutations: ledgerMutations,
      initial: LEDGER_INITIAL,
      onEvent: (event) => {
        events.push(event)
      },
    })
    const envelope = (mutationId: number, invocation: LedgerInvocation) => ({
      ...identity,
      mutationId,
      invocation,
    })

    await authority.deliver(envelope(1, addEntry({ entry: "one" })))
    await authority.deliver(envelope(1, addEntry({ entry: "one" })))
    await authority.deliver(envelope(3, addEntry({ entry: "three" })))
    authority.vetoNext({ kind: "vetoed" })
    await authority.deliver(envelope(2, addEntry({ entry: "two" })))
    await authority.deliver(
      envelope(3, { name: "nope", args: {} } as unknown as LedgerInvocation)
    )
    await authority.deliver(
      envelope(4, {
        name: "ledger.add",
        args: { entry: 7 },
      } as unknown as LedgerInvocation)
    )
    await authority.deliver(envelope(1, addEntry({ entry: "one" })))

    expect(events).toEqual([
      {
        kind: "recorded",
        client: identity,
        mutationId: 1,
        name: "ledger.add",
        outcome: "accepted",
      },
      { kind: "duplicate", client: identity, mutationId: 1 },
      { kind: "gap", client: identity, expected: 2, received: 3 },
      {
        kind: "recorded",
        client: identity,
        mutationId: 2,
        name: "ledger.add",
        outcome: "rejected",
      },
      {
        kind: "recorded",
        client: identity,
        mutationId: 3,
        name: "nope",
        outcome: "unknown-mutation",
      },
      {
        kind: "recorded",
        client: identity,
        mutationId: 4,
        name: "ledger.add",
        outcome: "invalid",
      },
      { kind: "outcome-unavailable", client: identity, mutationId: 1 },
    ])
  })
})
