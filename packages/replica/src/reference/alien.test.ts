import { describe, expect, it } from "vitest"

import { err } from "@workspace/result"

import {
  REPLICA_CONTRACT_LAW_NAMES,
  verifyReplicaContract,
  type ReplicaContractContext,
} from "../contract/replica-laws"
import { ContractViolation, settle } from "../contract/support"
import {
  TRANSPORT_CONTRACT_LAW_NAMES,
  verifyTransportContract,
  type TransportContractScenario,
} from "../contract/transport-laws"
import { createInMemoryAuthority } from "../in-memory-authority"
import { createReplica } from "../index"
import type { Accepted, MutationEnvelope } from "../protocol"
import type { ReplicaTransport } from "../transport"
import {
  addEntry,
  dropEntry,
  LEDGER_INITIAL,
  ledgerMutations,
  reserveIfCount,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "./ledger"
import {
  createPollingTransport,
  type PollingSourceClient,
} from "./polling-transport"

const identity = { clientGroupId: "alien", clientId: "alien-1" }
const RETRY_BUDGET = 3

interface HeldRead {
  released: boolean
  resolve(): void
}

/**
 * The controllable fake source behind the alien binding: an in-memory
 * authority exposed through an HTTP-shaped client whose reads can be gated,
 * severed, and observed — the "controllable harness for its source" the
 * transport contract requires.
 */
function createAlienWorld() {
  const authority = createInMemoryAuthority<
    Ledger,
    LedgerInvocation,
    LedgerError
  >({ mutations: ledgerMutations, initial: LEDGER_INITIAL })
  const handle = authority.transport(identity)
  const observations: Accepted<Ledger, number>[] = []
  const ticks = new Set<() => void>()
  const held: HeldRead[] = []
  let severed = false
  let gating = false
  let resolvedReads = 0
  let externalCounter = 0

  const initial = handle.accepted()
  observations.push(initial)

  const client: PollingSourceClient<Ledger, LedgerInvocation, LedgerError> = {
    fetchSnapshot() {
      if (severed) return Promise.reject(new Error("network severed"))
      // The response tuple is computed when the server handles the request;
      // gating only delays the response in flight, which is exactly the
      // "older response finishes last" race.
      const accepted = handle.accepted()
      observations.push(accepted)
      if (gating) {
        return new Promise((resolve) => {
          held.push({
            released: false,
            resolve: () => {
              resolvedReads += 1
              resolve(accepted)
            },
          })
        })
      }
      resolvedReads += 1
      return Promise.resolve(accepted)
    },
    pushEnvelope: (envelope, signal) => handle.transport.push(envelope, signal),
    subscribeTicks: (onTick) => {
      ticks.add(onTick)
      return () => ticks.delete(onTick)
    },
  }

  const fireTick = (): void => {
    for (const tick of [...ticks]) tick()
  }

  return {
    authority,
    handle,
    client,
    initial,
    observations,
    fireTick,
    reads: () => resolvedReads,
    advance: async () => {
      externalCounter += 1
      await authority.commitExternal(
        addEntry({ entry: `external-${externalCounter}` })
      )
    },
    sever: () => {
      severed = true
    },
    restore: () => {
      severed = false
      fireTick()
    },
    gate: () => {
      gating = true
      return {
        count: () => held.length,
        release: async (index: number) => {
          const entry = held[index]
          if (entry && !entry.released) {
            entry.released = true
            entry.resolve()
          }
          await settle(2)
        },
        releaseAll: async () => {
          for (const entry of held) {
            if (!entry.released) {
              entry.released = true
              entry.resolve()
            }
          }
          await settle(2)
        },
      }
    },
  }
}

type AlienScenario = TransportContractScenario<
  Ledger,
  LedgerInvocation,
  LedgerError,
  void,
  number
>

function createAlienScenario(
  world = createAlienWorld(),
  transport = createPollingTransport({
    client: world.client,
    initial: world.initial,
  })
): AlienScenario {
  return {
    transport,
    rejectionError: { kind: "vetoed" },
    authoritative: () => world.handle.accepted(),
    observations: () => [...world.observations],
    advance: () => world.advance(),
    signal: () => world.fireTick(),
    makeEnvelope: () => {
      const executedIds = world.authority
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
    received: world.authority.deliveries,
    executed: world.authority.executions,
    primePush: (outcome) => {
      if (outcome.kind === "reject") world.authority.vetoNext(outcome.error)
      else if (outcome.kind === "ambiguous-committed")
        world.authority.dropNextResult(1)
      else world.authority.failNextPush(1)
    },
    gateReads: () => world.gate(),
    sever: () => world.sever(),
    restore: () => world.restore(),
  }
}

/** Scalar cursors are totally ordered, so incomparability cannot exist. */
const ALIEN_OMITTED = ["incomparable-cursors"] as const

describe("transport contract — alien polling adapter", () => {
  const laws = verifyTransportContract({
    create: createAlienScenario,
    omit: ALIEN_OMITTED,
  })

  it("covers every law outside the declared omission", () => {
    expect(laws.length).toBe(
      TRANSPORT_CONTRACT_LAW_NAMES.length - ALIEN_OMITTED.length
    )
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("transport contract — negative control", () => {
  /**
   * A deliberately broken adapter that publishes pull responses in completion
   * order, straight to the sink: no generations, no causal gate. The suite
   * must go red on ordering and duplicate laws.
   */
  function createBrokenTransport(
    client: PollingSourceClient<Ledger, LedgerInvocation, LedgerError>
  ): ReplicaTransport<Ledger, LedgerInvocation, LedgerError, void, number> {
    return {
      connect(sink) {
        const pull = (): void => {
          client.fetchSnapshot(new AbortController().signal).then(
            (snapshot) => {
              sink.accept(snapshot)
              sink.setConnection("connected")
            },
            () => sink.setConnection("disconnected")
          )
        }
        pull()
        return client.subscribeTicks(pull)
      },
      async push(envelope, signal) {
        try {
          return await client.pushEnvelope(envelope, signal)
        } catch (cause) {
          return err({ kind: "retryable", cause })
        }
      },
    }
  }

  function createBrokenScenario(): AlienScenario {
    const world = createAlienWorld()
    return createAlienScenario(world, createBrokenTransport(world.client))
  }

  it("the pull-generation law goes red", async () => {
    const laws = verifyTransportContract({
      create: createBrokenScenario,
      omit: ALIEN_OMITTED,
    })
    const generationLaw = laws.find(
      (law) => law.name === TRANSPORT_CONTRACT_LAW_NAMES[1]
    )
    expect(generationLaw).toBeDefined()
    await expect(generationLaw!.run()).rejects.toThrow(ContractViolation)
  })

  it("the duplicate-suppression law goes red", async () => {
    const laws = verifyTransportContract({
      create: createBrokenScenario,
      omit: ALIEN_OMITTED,
    })
    const duplicateLaw = laws.find(
      (law) => law.name === TRANSPORT_CONTRACT_LAW_NAMES[2]
    )
    expect(duplicateLaw).toBeDefined()
    await expect(duplicateLaw!.run()).rejects.toThrow(ContractViolation)
  })
})

describe("replica contract — alien polling binding", () => {
  function createContext(): ReplicaContractContext<
    Ledger,
    LedgerInvocation,
    LedgerError,
    unknown
  > {
    const world = createAlienWorld()
    const transport = createPollingTransport({
      client: world.client,
      initial: world.initial,
    })
    const replica = createReplica({
      identity,
      initial: world.initial,
      mutations: ledgerMutations,
      transport,
      delivery: { retryBudget: RETRY_BUDGET },
    })

    const pullAndSettle = async (): Promise<void> => {
      const before = world.reads()
      world.fireTick()
      await settle(3)
      // A disposed replica has unsubscribed from ticks; there is no stream
      // left to deliver to, which is itself the correct outcome.
      if (world.reads() === before) return
      await settle(2)
    }

    return {
      replica,
      registry: ledgerMutations,
      identity,
      retryBudget: RETRY_BUDGET,
      fixtures: {
        writes: [addEntry({ entry: "alpha" }), addEntry({ entry: "beta" })],
        refused: dropEntry({ entry: "missing" }),
        external: addEntry({ entry: "external" }),
        conflicting: {
          pending: reserveIfCount({ expectedCount: 0, entry: "reserved" }),
          external: addEntry({ entry: "external" }),
        },
        vetoError: { kind: "vetoed" },
      },
      controls: {
        read: world.authority.read,
        publish: pullAndSettle,
        recover: pullAndSettle,
        commitExternal: (invocation) =>
          world.authority.commitExternal(invocation),
        deliver: (envelope: MutationEnvelope<LedgerInvocation>) =>
          world.authority.deliver(envelope),
        deliveries: world.authority.deliveries,
        executions: world.authority.executions,
        vetoNext: world.authority.vetoNext,
        failNextPush: world.authority.failNextPush,
        dropNextResult: world.authority.dropNextResult,
        pause: world.authority.pause,
        flush: world.authority.flush,
        resume: world.authority.resume,
      },
    }
  }

  const laws = verifyReplicaContract({ create: createContext })

  it("covers the full law set", () => {
    expect(laws.map((law) => law.name)).toEqual([...REPLICA_CONTRACT_LAW_NAMES])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})
