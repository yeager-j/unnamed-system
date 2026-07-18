import { describe, expect, it } from "vitest"

import {
  createReplica,
  type Accepted,
  type MutationEnvelope,
} from "@workspace/replica"
import {
  createInMemoryAuthority,
  REPLICA_CONTRACT_LAW_NAMES,
  settle,
  TRANSPORT_CONTRACT_LAW_NAMES,
  verifyReplicaContract,
  verifyTransportContract,
  type ReplicaContractContext,
  type TransportContractScenario,
} from "@workspace/replica/testing"

import type { VersionClass } from "@/lib/db/version-classes"

import { mergeComponents } from "../commit/merge-patch"
import type { EntityWrite } from "../commit/write.schema"
import { applyEntityWrite, ENTITY_WRITERS } from "../commit/writers"
import type { EntityVersionVector } from "./cursor"
import {
  entityReplicaMutations,
  writeEntity,
  type EntityComponents,
  type EntityReplicaInvocation,
} from "./mutations"
import type { EntityReplicaRejection } from "./rejection"
import { createEntityReplicaTransport } from "./transport"

const identity = { clientGroupId: "entity-e1", clientId: "tab-1" }
const RETRY_BUDGET = 3

const currency = (op: "addCurrency" | "removeCurrency", amount: number) =>
  writeEntity({ component: "equipment", op, amount })

const removeItem = (itemId: string) =>
  writeEntity({ component: "equipment", op: "remove", itemId })

/** Seeds the initial bag through the real Writer so item rows are engine-minted. */
function seedInitialComponents(): {
  components: EntityComponents
  seededItemId: string
} {
  const seed: EntityWrite = {
    component: "equipment",
    op: "add",
    catalogItemKey: "grimoire",
    quantity: 1,
    idSeed: "replica-fixture-seed",
  }
  const patch = applyEntityWrite({}, seed)
  if (!patch.ok) throw new Error(`fixture seeding refused: ${patch.error}`)
  const components = mergeComponents({}, patch.value)
  const itemId = components.equipment?.items[0]?.id
  if (!itemId) throw new Error("fixture seeding produced no item row")
  return { components, seededItemId: itemId }
}

/**
 * The controllable harness behind the Showtime binding: an in-memory
 * authority over real entity components, exposed through the Ably/refetch
 * source seam. The per-class version vector advances by each executed
 * write's `durableClass`, exactly as `bumpEntityVersionGuarded` does.
 */
function createEntityWorld() {
  const { components: initialComponents, seededItemId } =
    seedInitialComponents()
  const authority = createInMemoryAuthority<
    EntityComponents,
    EntityReplicaInvocation,
    EntityReplicaRejection
  >({ mutations: entityReplicaMutations, initial: initialComponents })
  const handle = authority.transport(identity)

  let vector: Record<VersionClass, number> = {
    identity: 1,
    vitals: 1,
    inventory: 1,
    progression: 1,
  }
  const observations: Accepted<EntityComponents, EntityVersionVector>[] = []
  const pingHandlers = new Set<{ onPing(): void; onReconnect(): void }>()
  const held: Array<{ released: boolean; resolve(): void }> = []
  let severed = false
  let gating = false
  let incomparableNext = false
  let resolvedReads = 0

  const bumpFor = (write: EntityWrite): void => {
    const durableClass = ENTITY_WRITERS[write.component].durableClass
    vector = { ...vector, [durableClass]: vector[durableClass] + 1 }
  }

  const currentAccepted = (): Accepted<
    EntityComponents,
    EntityVersionVector
  > => ({
    value: authority.read(),
    through: handle.accepted().through,
    cursor: { ...vector },
  })

  const initial = currentAccepted()
  observations.push(initial)

  /** Executes state changes bump the vector by the write's class; duplicates,
   *  vetoes, and gaps leave it untouched (the authority cursor tells us). */
  const trackingPush = async (
    envelope: MutationEnvelope<EntityReplicaInvocation>,
    signal: AbortSignal
  ) => {
    const before = authority.cursor()
    const result = await handle.transport.push(envelope, signal)
    if (authority.cursor() > before) bumpFor(envelope.invocation.args)
    return result
  }

  const source = {
    fetchAccepted(_signal: AbortSignal) {
      if (severed) return Promise.reject(new Error("network severed"))
      let accepted = currentAccepted()
      if (incomparableNext) {
        // A doctored racing-read observation: one class ahead of, one class
        // behind, the truth — incomparable under the product order.
        incomparableNext = false
        accepted = {
          ...accepted,
          cursor: {
            ...accepted.cursor,
            identity: (accepted.cursor.identity ?? 0) + 1,
            vitals: Math.max(0, (accepted.cursor.vitals ?? 1) - 1),
          },
        }
      }
      observations.push(accepted)
      if (gating) {
        return new Promise<typeof accepted>((resolve) => {
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
    pushEnvelope: trackingPush,
    subscribe(events: { onPing(): void; onReconnect(): void }) {
      pingHandlers.add(events)
      return () => pingHandlers.delete(events)
    },
  }

  return {
    authority,
    handle,
    source,
    initial,
    seededItemId,
    observations,
    currentAccepted,
    reads: () => resolvedReads,
    ping: () => {
      for (const handlers of [...pingHandlers]) handlers.onPing()
    },
    reconnect: () => {
      for (const handlers of [...pingHandlers]) handlers.onReconnect()
    },
    advance: async () => {
      const external = currency("addCurrency", 1)
      await authority.commitExternal(external)
      bumpFor(external.args)
    },
    commitExternal: async (invocation: EntityReplicaInvocation) => {
      await authority.commitExternal(invocation)
      bumpFor(invocation.args)
    },
    deliver: async (envelope: MutationEnvelope<EntityReplicaInvocation>) => {
      const before = authority.cursor()
      const result = await authority.deliver(envelope)
      if (authority.cursor() > before) bumpFor(envelope.invocation.args)
      return result
    },
    sever: () => {
      severed = true
    },
    restore: () => {
      severed = false
      for (const handlers of [...pingHandlers]) handlers.onReconnect()
    },
    markIncomparable: () => {
      incomparableNext = true
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

type EntityScenario = TransportContractScenario<
  EntityComponents,
  EntityReplicaInvocation,
  EntityReplicaRejection,
  void,
  EntityVersionVector
>

function createEntityScenario(): EntityScenario {
  const world = createEntityWorld()
  const transport = createEntityReplicaTransport({
    source: world.source,
    initial: world.initial,
  })

  return {
    transport,
    rejectionError: "capability-missing",
    authoritative: () => world.currentAccepted(),
    observations: () => [...world.observations],
    advance: () => world.advance(),
    signal: () => world.ping(),
    makeEnvelope: () => {
      const executedIds = world.authority
        .executions()
        .filter((envelope) => envelope.clientId === identity.clientId)
        .map((envelope) => envelope.mutationId)
      const next = (executedIds.length ? Math.max(...executedIds) : 0) + 1
      return {
        ...identity,
        mutationId: next,
        invocation: currency("addCurrency", 2),
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
    advanceIncomparable: () => world.markIncomparable(),
  }
}

describe("transport contract — Showtime entity adapter", () => {
  const laws = verifyTransportContract({ create: createEntityScenario })

  it("covers the full law set with no omissions", () => {
    expect(laws.map((law) => law.name)).toEqual([
      ...TRANSPORT_CONTRACT_LAW_NAMES,
    ])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("replica contract — Showtime entity binding", () => {
  function createContext(): ReplicaContractContext<
    EntityComponents,
    EntityReplicaInvocation,
    EntityReplicaRejection,
    unknown
  > {
    const world = createEntityWorld()
    const transport = createEntityReplicaTransport({
      source: world.source,
      initial: world.initial,
    })
    const replica = createReplica({
      identity,
      initial: world.initial,
      mutations: entityReplicaMutations,
      transport,
      delivery: { retryBudget: RETRY_BUDGET },
    })

    const pingAndSettle = async (): Promise<void> => {
      const before = world.reads()
      world.ping()
      await settle(3)
      // A disposed replica has unsubscribed; nothing left to deliver to.
      if (world.reads() === before) return
      await settle(2)
    }

    return {
      replica,
      registry: entityReplicaMutations,
      identity,
      retryBudget: RETRY_BUDGET,
      fixtures: {
        writes: [currency("addCurrency", 5), currency("addCurrency", 7)],
        refused: removeItem("never-existed"),
        external: currency("addCurrency", 3),
        conflicting: {
          // Removing the seeded item is valid against the initial bag but
          // refuses on replay once an external removal is incorporated —
          // the preconditioned-intent species.
          pending: removeItem(world.seededItemId),
          external: removeItem(world.seededItemId),
        },
        vetoError: "capability-missing",
      },
      controls: {
        read: world.authority.read,
        publish: pingAndSettle,
        recover: pingAndSettle,
        commitExternal: world.commitExternal,
        deliver: world.deliver,
        deliveries: world.authority.deliveries,
        executions: world.authority.executions,
        vetoNext: world.authority.vetoNext,
        failNextPush: world.authority.failNextPush,
        dropNextResult: world.authority.dropNextResult,
        pause: world.authority.pause,
        flush: world.authority.flush,
        resume: world.authority.resume,
        forgetClient: () => world.authority.forgetClient(identity),
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
