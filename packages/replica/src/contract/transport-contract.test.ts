import { describe, expect, it } from "vitest"

import { createInMemoryAuthority } from "../in-memory-authority"
import type { Accepted } from "../protocol"
import {
  addEntry,
  LEDGER_INITIAL,
  ledgerMutations,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "../reference/ledger"
import {
  TRANSPORT_CONTRACT_LAW_NAMES,
  verifyTransportContract,
  type TransportContractScenario,
} from "./transport-laws"

const identity = { clientGroupId: "group", clientId: "client-1" }

/**
 * The in-memory transport is a manual-publish control instrument, not a
 * pulling adapter: it has no reads to gate, no streaming connection to sever,
 * and its scalar cursor is totally ordered. Those capabilities are omitted
 * VISIBLY here and covered by the alien and Showtime adapters.
 */
const IN_MEMORY_OMITTED = [
  "pull-generations",
  "duplicate-suppression",
  "incomparable-cursors",
  "reconnect",
] as const

function createScenario(): TransportContractScenario<
  Ledger,
  LedgerInvocation,
  LedgerError,
  void,
  number
> {
  const authority = createInMemoryAuthority<
    Ledger,
    LedgerInvocation,
    LedgerError
  >({ mutations: ledgerMutations, initial: LEDGER_INITIAL })
  const handle = authority.transport(identity)
  const observations: Accepted<Ledger, number>[] = [handle.accepted()]
  let counter = 0

  return {
    transport: handle.transport,
    rejectionError: { kind: "vetoed" },
    authoritative: () => handle.accepted(),
    observations: () => [...observations],
    advance: async () => {
      counter += 1
      await authority.commitExternal(addEntry({ entry: `external-${counter}` }))
      observations.push(handle.accepted())
    },
    signal: () => {
      observations.push(handle.accepted())
      authority.publish()
    },
    makeEnvelope: () => {
      const executedIds = authority
        .executions()
        .filter((envelope) => envelope.clientId === identity.clientId)
        .map((envelope) => envelope.mutationId)
      const next = (executedIds.length ? Math.max(...executedIds) : 0) + 1
      return {
        ...identity,
        mutationId: next,
        invocation: addEntry({ entry: `pushed-${next}` }),
      }
    },
    received: authority.deliveries,
    executed: authority.executions,
    primePush: (outcome) => {
      if (outcome.kind === "reject") authority.vetoNext(outcome.error)
      else if (outcome.kind === "ambiguous-committed")
        authority.dropNextResult(1)
      else authority.failNextPush(1)
    },
  }
}

describe("transport contract — in-memory adapter", () => {
  const laws = verifyTransportContract({
    create: createScenario,
    omit: IN_MEMORY_OMITTED,
  })

  it("covers every law outside the declared omissions", () => {
    expect(laws.length).toBe(
      TRANSPORT_CONTRACT_LAW_NAMES.length - IN_MEMORY_OMITTED.length
    )
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})
