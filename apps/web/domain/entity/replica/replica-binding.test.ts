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
  wrapAuthoritySource,
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
  setEntityColumn,
  writeEntity,
  type EntityComponents,
  type EntityReplicaInvocation,
  type EntityReplicaState,
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
  const initialState: EntityReplicaState = {
    components: initialComponents,
    columns: {
      name: "Replica Fixture",
      portraitUrl: null,
      pronouns: null,
      notes: null,
    },
  }
  const authority = createInMemoryAuthority<
    EntityReplicaState,
    EntityReplicaInvocation,
    EntityReplicaRejection
  >({ mutations: entityReplicaMutations, initial: initialState })
  const handle = authority.transport(identity)

  let vector: Record<VersionClass, number> = {
    identity: 1,
    vitals: 1,
    inventory: 1,
    progression: 1,
  }

  const bumpFor = (invocation: EntityReplicaInvocation): void => {
    const durableClass =
      invocation.name === "entity.setColumn"
        ? "identity"
        : ENTITY_WRITERS[invocation.args.component].durableClass
    vector = { ...vector, [durableClass]: vector[durableClass] + 1 }
  }

  const currentAccepted = (): Accepted<
    EntityReplicaState,
    EntityVersionVector
  > => ({
    value: authority.read(),
    through: handle.accepted().through,
    cursor: { ...vector },
  })

  const initial = currentAccepted()

  /** Executes state changes bump the vector by the write's class; duplicates,
   *  vetoes, and gaps leave it untouched (the authority cursor tells us). */
  const trackingPush = async (
    envelope: MutationEnvelope<EntityReplicaInvocation>,
    signal: AbortSignal
  ) => {
    const before = authority.cursor()
    const result = await handle.transport.push(envelope, signal)
    if (authority.cursor() > before) bumpFor(envelope.invocation)
    return result
  }

  const wrapped = wrapAuthoritySource({
    accepted: currentAccepted,
    push: trackingPush,
  })

  const source = {
    fetchAccepted: wrapped.source.fetchAccepted,
    pushEnvelope: wrapped.source.pushEnvelope,
    // The production seam distinguishes ping from reconnect; the transport
    // maps both to the same invalidation pull, so the harness carries one.
    subscribe: (events: { onPing(): void; onReconnect(): void }) =>
      wrapped.source.subscribe(events.onPing),
  }

  return {
    authority,
    handle,
    source,
    initial,
    seededItemId,
    observations: () => [initial, ...wrapped.observations()],
    currentAccepted,
    reads: wrapped.reads,
    ping: wrapped.signal,
    reconnect: wrapped.signal,
    advance: async () => {
      const external = currency("addCurrency", 1)
      await authority.commitExternal(external)
      bumpFor(external)
    },
    commitExternal: async (invocation: EntityReplicaInvocation) => {
      await authority.commitExternal(invocation)
      bumpFor(invocation)
    },
    deliver: async (envelope: MutationEnvelope<EntityReplicaInvocation>) => {
      const before = authority.cursor()
      const result = await authority.deliver(envelope)
      if (authority.cursor() > before) bumpFor(envelope.invocation)
      return result
    },
    sever: wrapped.sever,
    restore: wrapped.restore,
    markIncomparable: () =>
      // A doctored racing-read observation: one class ahead of, one class
      // behind, the truth — incomparable under the product order.
      wrapped.doctorNext((accepted) => ({
        ...accepted,
        cursor: {
          ...accepted.cursor,
          identity: (accepted.cursor.identity ?? 0) + 1,
          vitals: Math.max(0, (accepted.cursor.vitals ?? 1) - 1),
        },
      })),
    gate: wrapped.gate,
  }
}

type EntityScenario = TransportContractScenario<
  EntityReplicaState,
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
    observations: world.observations,
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
    EntityReplicaState,
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

describe("Showtime entity mutation vocabulary", () => {
  it("serializes component and column intent on one ordered stream", async () => {
    const world = createEntityWorld()
    const replica = createReplica({
      identity,
      initial: world.initial,
      mutations: entityReplicaMutations,
      transport: createEntityReplicaTransport({
        source: world.source,
        initial: world.initial,
      }),
    })

    const component = replica.mutate(currency("addCurrency", 2))
    const column = replica.mutate(
      setEntityColumn({ column: "name", value: "Iris" })
    )

    await Promise.all([component.remote, column.remote])
    expect(
      world.authority
        .deliveries()
        .map((delivery) => [delivery.mutationId, delivery.invocation.name])
    ).toEqual([
      [1, "entity.write"],
      [2, "entity.setColumn"],
    ])
    expect(world.authority.read().columns.name).toBe("Iris")
    expect(world.authority.read().components.equipment?.currency).toBe(2)

    replica.dispose()
  })
})
