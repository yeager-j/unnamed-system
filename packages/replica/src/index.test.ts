import { describe, expect, it } from "vitest"

import { createInMemoryAuthority } from "./in-memory-authority"
import { createReplica, defineMutations } from "./index"
import {
  addEntry,
  LEDGER_INITIAL,
  ledgerMutations,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "./reference/ledger"

const identity = { clientGroupId: "group", clientId: "client-1" }

function build() {
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
  })
  return { authority, replica }
}

describe("createReplica", () => {
  it("rejects invalid arguments with a typed schema failure", async () => {
    const { replica } = build()
    const receipt = replica.mutate({
      name: "ledger.add",
      args: { entry: 42 },
    } as unknown as LedgerInvocation)
    expect(receipt.id).toBeNull()
    const local = await receipt.local
    expect(local.ok).toBe(false)
    if (!local.ok) expect(local.error.kind).toBe("invalid")
    replica.dispose()
  })

  it("throws on a mutation outside the registry", () => {
    const { replica } = build()
    expect(() =>
      replica.mutate({
        name: "not-registered",
        args: {},
      } as unknown as LedgerInvocation)
    ).toThrow(/not in this replica's registry/)
    replica.dispose()
  })

  it("continues the ID sequence from the initial watermark", async () => {
    const authority = createInMemoryAuthority<
      Ledger,
      LedgerInvocation,
      LedgerError
    >({ mutations: ledgerMutations, initial: LEDGER_INITIAL })
    const handle = authority.transport(identity)
    // Advance the authority's ledger for this client to 2 first.
    await authority.deliver({
      ...identity,
      mutationId: 1,
      invocation: addEntry({ entry: "one" }),
    })
    await authority.deliver({
      ...identity,
      mutationId: 2,
      invocation: addEntry({ entry: "two" }),
    })
    // A reloaded replica starts from the personalized accepted tuple.
    const replica = createReplica({
      identity,
      initial: handle.accepted(),
      mutations: ledgerMutations,
      transport: handle.transport,
    })
    const receipt = replica.mutate(addEntry({ entry: "three" }))
    expect(receipt.id).toBe(3)
    const remote = await receipt.remote
    expect(remote.ok).toBe(true)
    replica.dispose()
  })
})

describe("defineMutations", () => {
  it("rejects duplicate mutation names", () => {
    expect(() => defineMutations([addEntry, addEntry])).toThrow(/Duplicate/)
  })

  it("decodes wire invocations and refuses unknown names", () => {
    const decoded = ledgerMutations.decode({
      name: "ledger.add",
      args: { entry: "x" },
    })
    expect(decoded.ok).toBe(true)
    const unknown = ledgerMutations.decode({ name: "nope", args: {} })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.error.kind).toBe("unknown-mutation")
  })
})
