import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { PRISMA_BASE_CHARGES } from "@workspace/game-v2/resources/derive"
import {
  createReplica,
  type Accepted,
  type MutationEnvelope,
} from "@workspace/replica"
import {
  createInMemoryAuthority,
  REPLICA_CONTRACT_LAW_NAMES,
  REPLICA_CONTRACT_RECORDED_LAW_NAME,
  settle,
  TRANSPORT_CONTRACT_LAW_NAMES,
  verifyReplicaContract,
  verifyTransportContract,
  wrapAuthoritySource,
  type ReplicaContractContext,
  type TransportContractScenario,
} from "@workspace/replica/testing"
import {
  classifyScalarCursor,
  createPullTransport,
} from "@workspace/replica/transport"
import { err, ok } from "@workspace/result"

import {
  compareEntityVersionVectors,
  type EntityVersionVector,
} from "../../entity/replica/cursor"
import {
  combatDurableMutations,
  combatInlineMutations,
  writeCombatEntity,
  writeCombatInline,
  type CombatDurableInvocation,
  type CombatDurableState,
  type CombatInlineInvocation,
  type CombatInlineState,
  type CombatWriteRefusal,
} from "./mutations"

const RETRY_BUDGET = 3

const damage = (amount: number) =>
  ({ component: "vitals", op: "damage", amount }) as const
const spDamage = (amount: number) =>
  ({ component: "skillPool", op: "damage", amount }) as const
const usePrisma = { component: "resources", op: "usePrisma" } as const

/**
 * Fixture requirements (packages/replica/CLAUDE.md): the writes are damage —
 * order-sensitive, non-idempotent; the refusal is a skillPool write against a
 * state with no skillPool; the conflicting pair is the last Prisma charge —
 * `pending` valid against the initial state, refused on replay once
 * `external` consumed the charge.
 */
const combatComponents = {
  vitals: { base: 20, damage: 0 },
  resources: {
    hitDiceUsed: 0,
    skillDiceUsed: 0,
    prismaUsed: PRISMA_BASE_CHARGES - 1,
  },
}

// ── Durable binding: one entity row, per-class vector cursor ─────────────────

const durableIdentity = { clientGroupId: "combat-entity:e1", clientId: "tab-1" }

function createDurableWorld() {
  const initialState: CombatDurableState = { components: combatComponents }
  const authority = createInMemoryAuthority<
    CombatDurableState,
    CombatDurableInvocation,
    CombatWriteRefusal
  >({ mutations: combatDurableMutations, initial: initialState })
  const handle = authority.transport(durableIdentity)

  // Every combat arm is vitals-class, exactly as `entityVersionIncrement`
  // bumps at the real door; other classes exist only for the incomparable
  // doctoring below.
  let vector: EntityVersionVector = { identity: 1, vitals: 1 }
  const bump = (): void => {
    vector = { ...vector, vitals: (vector.vitals ?? 0) + 1 }
  }

  const currentAccepted = (): Accepted<
    CombatDurableState,
    EntityVersionVector
  > => ({
    value: authority.read(),
    through: handle.accepted().through,
    cursor: { ...vector },
  })

  const wrapped = wrapAuthoritySource({
    accepted: currentAccepted,
    push: async (
      envelope: MutationEnvelope<CombatDurableInvocation>,
      signal: AbortSignal
    ) => {
      const before = authority.cursor()
      const result = await handle.transport.push(envelope, signal)
      if (authority.cursor() > before) bump()
      return result
    },
  })

  const initial = currentAccepted()

  return {
    authority,
    wrapped,
    initial,
    currentAccepted,
    transport: () =>
      createPullTransport({
        source: wrapped.source,
        initial,
        classify: compareEntityVersionVectors,
      }),
    advance: async () => {
      await authority.commitExternal(writeCombatEntity(damage(1)))
      bump()
    },
    commitExternal: async (invocation: CombatDurableInvocation) => {
      await authority.commitExternal(invocation)
      bump()
    },
    deliver: async (envelope: MutationEnvelope<CombatDurableInvocation>) => {
      const before = authority.cursor()
      const result = await authority.deliver(envelope)
      if (authority.cursor() > before) bump()
      return result
    },
    markIncomparable: () =>
      // A doctored racing-read observation: ahead of every emission on
      // `identity`, behind every emission on `vitals` (the floor) —
      // incomparable under the product order no matter how far the law's
      // preceding advance() moved the truth.
      wrapped.doctorNext((accepted) => ({
        ...accepted,
        cursor: {
          ...accepted.cursor,
          identity: (accepted.cursor.identity ?? 0) + 1,
          vitals: 0,
        },
      })),
  }
}

type DurableScenario = TransportContractScenario<
  CombatDurableState,
  CombatDurableInvocation,
  CombatWriteRefusal,
  void,
  EntityVersionVector
>

function createDurableScenario(): DurableScenario {
  const world = createDurableWorld()
  return {
    transport: world.transport(),
    rejectionError: "capability-missing",
    authoritative: () => world.currentAccepted(),
    observations: () => [world.initial, ...world.wrapped.observations()],
    advance: () => world.advance(),
    signal: () => world.wrapped.signal(),
    makeEnvelope: () => {
      const executedIds = world.authority
        .executions()
        .filter((envelope) => envelope.clientId === durableIdentity.clientId)
        .map((envelope) => envelope.mutationId)
      const next = (executedIds.length ? Math.max(...executedIds) : 0) + 1
      return {
        ...durableIdentity,
        mutationId: next,
        invocation: writeCombatEntity(damage(2)),
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
    gateReads: () => world.wrapped.gate(),
    sever: () => world.wrapped.sever(),
    restore: () => world.wrapped.restore(),
    advanceIncomparable: () => world.markIncomparable(),
  }
}

describe("transport contract — combat durable adapter", () => {
  const laws = verifyTransportContract({ create: createDurableScenario })

  it("covers the full law set with no omissions", () => {
    expect(laws.map((law) => law.name)).toEqual([
      ...TRANSPORT_CONTRACT_LAW_NAMES,
    ])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("replica contract — combat durable binding", () => {
  function createContext(): ReplicaContractContext<
    CombatDurableState,
    CombatDurableInvocation,
    CombatWriteRefusal,
    unknown
  > {
    const world = createDurableWorld()
    const replica = createReplica({
      identity: durableIdentity,
      initial: world.initial,
      mutations: combatDurableMutations,
      transport: world.transport(),
      delivery: { retryBudget: RETRY_BUDGET },
    })

    const pingAndSettle = async (): Promise<void> => {
      const before = world.wrapped.reads()
      world.wrapped.signal()
      await settle(3)
      if (world.wrapped.reads() === before) return
      await settle(2)
    }

    return {
      replica,
      registry: combatDurableMutations,
      identity: durableIdentity,
      retryBudget: RETRY_BUDGET,
      fixtures: {
        writes: [writeCombatEntity(damage(3)), writeCombatEntity(damage(5))],
        refused: writeCombatEntity(spDamage(1)),
        external: writeCombatEntity(damage(1)),
        conflicting: {
          // The last Prisma charge: valid against the initial state, refused
          // on replay once the external use is incorporated — the
          // preconditioned-intent species.
          pending: writeCombatEntity(usePrisma),
          external: writeCombatEntity(usePrisma),
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
        forgetClient: () => world.authority.forgetClient(durableIdentity),
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

// ── Inline binding: collection-valued root, scalar cursor, recorded Remote ───

const inlineIdentity = {
  clientGroupId: "combat-session:enc1",
  clientId: "tab-1",
}
const p1 = asParticipantId("p-goblin")
const p2 = asParticipantId("p-ogre")
const ghost = asParticipantId("p-vanished")

type SessionRemote = { version: number }

function createInlineWorld() {
  const initialState: CombatInlineState = {
    participants: {
      [p1]: combatComponents,
      [p2]: { vitals: { base: 30, damage: 0 } },
    },
  }
  // The session door's non-void Remote: the committed encounter version.
  // The closure counter mirrors the authority's version — it advances only
  // when an execution commits, exactly like the locked row's bump.
  let commits = 0
  const authority = createInMemoryAuthority<
    CombatInlineState,
    CombatInlineInvocation,
    CombatWriteRefusal,
    SessionRemote
  >({
    mutations: combatInlineMutations,
    initial: initialState,
    execute: (state, invocation) => {
      const definition = combatInlineMutations.get(invocation.name)
      if (!definition) throw new Error(`unknown ${invocation.name}`)
      const applied = definition.apply(state, invocation.args, {
        phase: "rebase",
      })
      if (!applied.ok) return err(applied.error)
      commits += 1
      return ok({ state: applied.value, remote: { version: commits } })
    },
  })
  const handle = authority.transport(inlineIdentity)

  const currentAccepted = (): Accepted<CombatInlineState, number> => ({
    value: authority.read(),
    through: handle.accepted().through,
    // The encounter row's scalar version — any committed write bumps it.
    cursor: authority.cursor(),
  })

  const wrapped = wrapAuthoritySource({
    accepted: currentAccepted,
    push: (
      envelope: MutationEnvelope<CombatInlineInvocation>,
      signal: AbortSignal
    ) => handle.transport.push(envelope, signal),
  })

  const initial = currentAccepted()

  return {
    authority,
    wrapped,
    initial,
    currentAccepted,
    transport: () =>
      createPullTransport({
        source: wrapped.source,
        initial,
        classify: classifyScalarCursor,
      }),
    advance: () =>
      authority.commitExternal(
        writeCombatInline({ participantId: p2, write: damage(1) })
      ),
  }
}

type InlineScenario = TransportContractScenario<
  CombatInlineState,
  CombatInlineInvocation,
  CombatWriteRefusal,
  SessionRemote,
  number
>

function createInlineScenario(): InlineScenario {
  const world = createInlineWorld()
  return {
    transport: world.transport(),
    rejectionError: "participant-not-found",
    authoritative: () => world.currentAccepted(),
    observations: () => [world.initial, ...world.wrapped.observations()],
    advance: () => world.advance(),
    signal: () => world.wrapped.signal(),
    makeEnvelope: () => {
      const executedIds = world.authority
        .executions()
        .filter((envelope) => envelope.clientId === inlineIdentity.clientId)
        .map((envelope) => envelope.mutationId)
      const next = (executedIds.length ? Math.max(...executedIds) : 0) + 1
      return {
        ...inlineIdentity,
        mutationId: next,
        invocation: writeCombatInline({ participantId: p1, write: damage(2) }),
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
    gateReads: () => world.wrapped.gate(),
    sever: () => world.wrapped.sever(),
    restore: () => world.wrapped.restore(),
    // A scalar cursor is totally ordered — incomparable observations cannot
    // exist, so the capability is deliberately omitted below with the law
    // count re-asserted (the one sanctioned omission shape).
  }
}

describe("transport contract — combat inline adapter", () => {
  const laws = verifyTransportContract({
    create: createInlineScenario,
    omit: ["incomparable-cursors"],
  })

  it("covers every law except the impossible incomparable-cursor case", () => {
    const omitted = new Set([
      "recovers rather than guessing when cursors are incomparable",
    ])
    expect(laws.map((law) => law.name)).toEqual(
      TRANSPORT_CONTRACT_LAW_NAMES.filter((name) => !omitted.has(name))
    )
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("replica contract — combat inline binding (recorded Remote)", () => {
  function createContext(): ReplicaContractContext<
    CombatInlineState,
    CombatInlineInvocation,
    CombatWriteRefusal,
    unknown
  > {
    const world = createInlineWorld()
    const replica = createReplica({
      identity: inlineIdentity,
      initial: world.initial,
      mutations: combatInlineMutations,
      transport: world.transport(),
      delivery: { retryBudget: RETRY_BUDGET },
    })

    const pingAndSettle = async (): Promise<void> => {
      const before = world.wrapped.reads()
      world.wrapped.signal()
      await settle(3)
      if (world.wrapped.reads() === before) return
      await settle(2)
    }

    return {
      replica,
      registry: combatInlineMutations,
      identity: inlineIdentity,
      retryBudget: RETRY_BUDGET,
      fixtures: {
        writes: [
          writeCombatInline({ participantId: p1, write: damage(3) }),
          writeCombatInline({ participantId: p1, write: damage(5) }),
        ],
        // Against the initial roster: the participant never existed.
        refused: writeCombatInline({ participantId: ghost, write: damage(1) }),
        external: writeCombatInline({ participantId: p2, write: damage(1) }),
        conflicting: {
          pending: writeCombatInline({ participantId: p1, write: usePrisma }),
          external: writeCombatInline({ participantId: p1, write: usePrisma }),
        },
        vetoError: "capability-missing",
        expectedRemote: { version: 1 },
      },
      controls: {
        read: world.authority.read,
        publish: pingAndSettle,
        recover: pingAndSettle,
        commitExternal: (invocation) =>
          world.authority.commitExternal(invocation),
        deliver: (envelope) => world.authority.deliver(envelope),
        deliveries: world.authority.deliveries,
        executions: world.authority.executions,
        vetoNext: world.authority.vetoNext,
        failNextPush: world.authority.failNextPush,
        dropNextResult: world.authority.dropNextResult,
        pause: world.authority.pause,
        flush: world.authority.flush,
        resume: world.authority.resume,
        forgetClient: () => world.authority.forgetClient(inlineIdentity),
      },
    }
  }

  const laws = verifyReplicaContract({
    create: createContext,
    remoteMode: "recorded",
  })

  it("covers the full law set plus the recorded-remote law", () => {
    expect(laws.map((law) => law.name)).toEqual([
      ...REPLICA_CONTRACT_LAW_NAMES,
      REPLICA_CONTRACT_RECORDED_LAW_NAME,
    ])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})
