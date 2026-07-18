import { describe, expect, it } from "vitest"

import { err, ok } from "@workspace/result"

import { createInMemoryAuthority } from "../in-memory-authority"
import { createReplica } from "../index"
import {
  addEntry,
  dropEntry,
  LEDGER_INITIAL,
  ledgerMutations,
  reserveIfCount,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "../reference/ledger"
import type { ReplicaTransportSink } from "../transport"
import {
  REPLICA_CONTRACT_LAW_NAMES,
  REPLICA_CONTRACT_RECORDED_LAW_NAME,
  verifyReplicaContract,
  type ReplicaContractContext,
  type ReplicaContractFixtures,
} from "./replica-laws"
import { ContractViolation } from "./support"

const identity = { clientGroupId: "group", clientId: "client-1" }
const RETRY_BUDGET = 3

function ledgerFixtures(): ReplicaContractFixtures<
  LedgerInvocation,
  LedgerError
> {
  return {
    writes: [addEntry({ entry: "alpha" }), addEntry({ entry: "beta" })],
    refused: dropEntry({ entry: "missing" }),
    external: addEntry({ entry: "external" }),
    conflicting: {
      pending: reserveIfCount({ expectedCount: 0, entry: "reserved" }),
      external: addEntry({ entry: "external" }),
    },
    vetoError: { kind: "vetoed" },
  }
}

type Context = ReplicaContractContext<
  Ledger,
  LedgerInvocation,
  LedgerError,
  unknown
>

function createContext(): Context {
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
    delivery: { retryBudget: RETRY_BUDGET },
  })
  return {
    replica,
    registry: ledgerMutations,
    identity,
    retryBudget: RETRY_BUDGET,
    fixtures: ledgerFixtures(),
    controls: {
      read: authority.read,
      publish: authority.publish,
      recover: () => {
        authority.publish()
        handle.alive()
      },
      commitExternal: authority.commitExternal,
      deliver: authority.deliver,
      deliveries: authority.deliveries,
      executions: authority.executions,
      vetoNext: authority.vetoNext,
      failNextPush: authority.failNextPush,
      dropNextResult: authority.dropNextResult,
      pause: authority.pause,
      flush: authority.flush,
      resume: authority.resume,
      forgetClient: () => authority.forgetClient(identity),
    },
  }
}

describe("replica contract — in-memory authority", () => {
  const laws = verifyReplicaContract({ create: createContext })

  it("covers the full law set", () => {
    expect(laws.map((law) => law.name)).toEqual([...REPLICA_CONTRACT_LAW_NAMES])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("replica contract — recorded remote mode", () => {
  interface CommitReceipt {
    count: number
  }

  function createRecordedContext(): Context {
    const authority = createInMemoryAuthority<
      Ledger,
      LedgerInvocation,
      LedgerError,
      CommitReceipt
    >({
      mutations: ledgerMutations,
      initial: LEDGER_INITIAL,
      execute: (state, invocation) => {
        const definition = ledgerMutations.get(invocation.name)
        if (!definition) throw new Error(`unknown ${invocation.name}`)
        const applied = definition.apply(state, invocation.args, {
          phase: "rebase",
        })
        if (!applied.ok) return err(applied.error)
        return ok({
          state: applied.value,
          remote: { count: applied.value.entries.length },
        })
      },
    })
    const handle = authority.transport(identity)
    const replica = createReplica({
      identity,
      initial: { value: LEDGER_INITIAL, through: 0, cursor: 0 },
      mutations: ledgerMutations,
      transport: handle.transport,
      delivery: { retryBudget: RETRY_BUDGET },
    })
    return {
      replica,
      registry: ledgerMutations,
      identity,
      retryBudget: RETRY_BUDGET,
      fixtures: {
        ...ledgerFixtures(),
        // writes[0] against the empty initial ledger yields one entry; a
        // recompute after the external commit would yield two, so the law
        // can tell a recorded result from a reconstructed one.
        expectedRemote: { count: 1 },
      },
      controls: {
        read: authority.read,
        publish: authority.publish,
        recover: () => {
          authority.publish()
          handle.alive()
        },
        commitExternal: authority.commitExternal,
        deliver: authority.deliver,
        deliveries: authority.deliveries,
        executions: authority.executions,
        vetoNext: authority.vetoNext,
        failNextPush: authority.failNextPush,
        dropNextResult: authority.dropNextResult,
        pause: authority.pause,
        flush: authority.flush,
        resume: authority.resume,
        forgetClient: () => authority.forgetClient(identity),
      },
    }
  }

  const laws = verifyReplicaContract({
    create: createRecordedContext,
    remoteMode: "recorded",
  })

  it("adds the recorded-result law", () => {
    expect(laws.map((law) => law.name)).toEqual([
      ...REPLICA_CONTRACT_LAW_NAMES,
      REPLICA_CONTRACT_RECORDED_LAW_NAME,
    ])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("replica contract — negative controls", () => {
  it("re-identifying duplicate deliveries turns the dedup laws red", async () => {
    // A broken runtime that mints a fresh ID per redelivery defeats
    // authority-side dedup; the suite must notice.
    const laws = verifyReplicaContract({
      create: () => {
        const ctx = createContext()
        return {
          ...ctx,
          controls: {
            ...ctx.controls,
            deliver: (envelope) =>
              ctx.controls.deliver({
                ...envelope,
                mutationId: envelope.mutationId + 1,
              }),
          },
        }
      },
    })
    const dedupLaw = laws.find(
      (law) => law.name === REPLICA_CONTRACT_LAW_NAMES[3]
    )
    expect(dedupLaw).toBeDefined()
    await expect(dedupLaw!.run()).rejects.toThrow(ContractViolation)
  })

  it("a watermark-corrupting stream turns the rebase law red", async () => {
    // A stream that claims incorporation of mutations the base does not
    // contain silently deletes predictions; the rebase law must notice.
    const laws = verifyReplicaContract({
      create: () => {
        const authority = createInMemoryAuthority<
          Ledger,
          LedgerInvocation,
          LedgerError
        >({ mutations: ledgerMutations, initial: LEDGER_INITIAL })
        const handle = authority.transport(identity)
        let capturedSink: ReplicaTransportSink<Ledger, number> | null = null
        const replica = createReplica({
          identity,
          initial: { value: LEDGER_INITIAL, through: 0, cursor: 0 },
          mutations: ledgerMutations,
          transport: {
            connect: (sink) => {
              capturedSink = sink
              return handle.transport.connect(sink)
            },
            push: (envelope, signal) => handle.transport.push(envelope, signal),
          },
          delivery: { retryBudget: RETRY_BUDGET },
        })
        return {
          replica,
          registry: ledgerMutations,
          identity,
          retryBudget: RETRY_BUDGET,
          fixtures: ledgerFixtures(),
          controls: {
            read: authority.read,
            publish: () => {
              capturedSink?.accept({
                value: authority.read(),
                through: 999,
                cursor: authority.cursor(),
              })
            },
            recover: () => {
              authority.publish()
              handle.alive()
            },
            commitExternal: authority.commitExternal,
            deliver: authority.deliver,
            deliveries: authority.deliveries,
            executions: authority.executions,
            vetoNext: authority.vetoNext,
            failNextPush: authority.failNextPush,
            dropNextResult: authority.dropNextResult,
            pause: authority.pause,
            flush: authority.flush,
            resume: authority.resume,
            forgetClient: () => authority.forgetClient(identity),
          },
        }
      },
    })
    const rebaseLaw = laws.find(
      (law) => law.name === REPLICA_CONTRACT_LAW_NAMES[6]
    )
    expect(rebaseLaw).toBeDefined()
    await expect(rebaseLaw!.run()).rejects.toThrow(ContractViolation)
  })
})
