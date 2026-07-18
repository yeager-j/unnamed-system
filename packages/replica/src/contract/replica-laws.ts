import type { Result } from "@workspace/result"

import type { MutationError, Replica } from "../index"
import type {
  MutationContext,
  MutationInvocation,
  MutationRegistry,
} from "../mutations"
import type { ClientIdentity, MutationEnvelope } from "../protocol"
import type { ProcessRefusal } from "../server"
import {
  assertDeepEqual,
  deepEqual,
  eventually,
  invariant,
  isUnsettled,
  settle,
  type ContractLaw,
} from "./support"

/**
 * The control surface a binding must expose over its (faked) source to run
 * the replica contract. The in-memory authority implements it natively; a
 * production-shaped binding implements it against its controllable harness.
 */
export interface ReplicaContractControls<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
> {
  /** Authoritative state as the source would serve it now. */
  read(): State
  /**
   * Deliver the current personalized accepted snapshot to the replica's
   * stream, resolving once the replica has observed it. Duplicate-suppressing
   * transports may deliver nothing when the tuple is unchanged; the promise
   * still resolves.
   */
  publish(): void | Promise<void>
  /**
   * Re-establish the accepted-state stream after an outage: deliver current
   * accepted state (and any connection signal the transport uses) so a
   * parked replica can resume delivery.
   */
  recover(): void | Promise<void>
  /** Commit a change as an out-of-band writer. */
  commitExternal(invocation: Invocation): Promise<void>
  /** Direct protocol injection for gap/dedup laws (bypasses the replica). */
  deliver(
    envelope: MutationEnvelope<Invocation>
  ): Promise<Result<unknown, ProcessRefusal<ApplyError>>>
  deliveries(): ReadonlyArray<MutationEnvelope<Invocation>>
  executions(): ReadonlyArray<MutationEnvelope<Invocation>>
  vetoNext(error: ApplyError): void
  failNextPush(count?: number): void
  dropNextResult(count?: number): void
  pause(): void
  flush(count?: number): Promise<void>
  resume(): Promise<void>
}

/**
 * Fixture invocations over the binding's own domain. Requirements:
 * - `writes` change observable state, are order-preserving under
 *   accumulation, and stay valid from the initial state, after each other,
 *   and after either external commit below.
 * - `refused` is refused by local `apply` against the initial state.
 * - `external` observably changes state when committed out-of-band.
 * - `conflicting.pending` is valid against the initial state but refuses on
 *   replay once `conflicting.external` is incorporated.
 */
export interface ReplicaContractFixtures<Invocation, ApplyError> {
  readonly writes: readonly [Invocation, Invocation]
  readonly refused: Invocation
  readonly external: Invocation
  readonly conflicting: {
    readonly pending: Invocation
    readonly external: Invocation
  }
  readonly vetoError: ApplyError
  /**
   * Recorded-remote mode only: the remote value the authority returns for
   * `writes[0]` executed against the initial authority state.
   */
  readonly expectedRemote?: unknown
}

export interface ReplicaContractContext<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
> {
  readonly replica: Replica<State, Invocation, ApplyError, Remote>
  readonly registry: MutationRegistry<State, Invocation, ApplyError>
  readonly identity: ClientIdentity
  /** The retry budget the replica under test was created with. */
  readonly retryBudget: number
  readonly fixtures: ReplicaContractFixtures<Invocation, ApplyError>
  readonly controls: ReplicaContractControls<State, Invocation, ApplyError>
  dispose?(): void
}

export interface ReplicaContractOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
> {
  create():
    | ReplicaContractContext<State, Invocation, ApplyError, Remote>
    | Promise<ReplicaContractContext<State, Invocation, ApplyError, Remote>>
  /**
   * `recorded` adds the law that a redelivered mutation reproduces its
   * original non-void remote result instead of recomputing it.
   */
  remoteMode?: "acknowledgment" | "recorded"
}

export const REPLICA_CONTRACT_LAW_NAMES = [
  "first local mutation projects synchronously and is delivered once",
  "back-to-back mutations serialize and accumulate over the projected value",
  "retry redelivers the same envelope identity",
  "authority deduplication prevents duplicate execution",
  "a duplicate returns the same terminal classification",
  "an ID gap is rejected without executing application code",
  "an external accepted snapshot rebases pending mutations in order",
  "an incorporated mutation is pruned exactly once",
  "accepted-base replacement and replay publish atomically",
  "local refusal never enters the pending log",
  "terminal remote rejection rolls back its prediction and preserves later valid intent",
  "replay refusal surfaces a conflict without corrupting later replay",
  "accepted snapshots around remote acknowledgment do not flicker or double apply",
  "retry-budget exhaustion leaves the mutation projected and remote unresolved",
  "later mutations remain blocked while the head outcome is ambiguous",
  "reconnect obtains accepted state and redelivers the same envelope",
  "incorporation may prune prediction before the lost remote outcome is recovered",
  "disposal unsubscribes and cancels outstanding waits",
] as const

export const REPLICA_CONTRACT_RECORDED_LAW_NAME =
  "non-void result mode reproduces the original terminal result on redelivery"

type Ctx<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
> = ReplicaContractContext<State, Invocation, ApplyError, Remote>

export function verifyReplicaContract<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
>(
  options: ReplicaContractOptions<State, Invocation, ApplyError, Remote>
): ContractLaw[] {
  type C = Ctx<State, Invocation, ApplyError, Remote>

  function law(name: string, body: (ctx: C) => Promise<void>): ContractLaw {
    return {
      name,
      run: async () => {
        const ctx = await options.create()
        try {
          await body(ctx)
        } finally {
          ctx.replica.dispose()
          ctx.dispose?.()
        }
      },
    }
  }

  /** Folds fixture invocations through the registry to compute expectations. */
  function applyAll(
    ctx: C,
    state: State,
    invocations: ReadonlyArray<Invocation>,
    phase: MutationContext["phase"]
  ): State {
    let value = state
    for (const invocation of invocations) {
      const decoded = ctx.registry.decode(invocation)
      invariant(
        decoded.ok,
        `fixture invocation "${invocation.name}" failed to decode`
      )
      const definition = ctx.registry.get(invocation.name)
      invariant(definition, `fixture invocation "${invocation.name}" unknown`)
      const applied = definition.apply(value, decoded.value.args, { phase })
      invariant(
        applied.ok,
        `fixture invocation "${invocation.name}" refused while computing an expectation`
      )
      value = applied.value
    }
    return value
  }

  function remoteError(
    outcome: Result<unknown, MutationError<ApplyError>>,
    label: string
  ): MutationError<ApplyError> {
    invariant(!outcome.ok, `${label}: expected a failed result`)
    return outcome.error
  }

  const laws: ContractLaw[] = [
    law(REPLICA_CONTRACT_LAW_NAMES[0], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      const before = replica.getSnapshot()
      const receipt = replica.mutate(fixtures.writes[0])
      const after = replica.getSnapshot()
      invariant(after !== before, "mutate must publish synchronously")
      invariant(after.pending === 1, "pending count must reflect the mutation")
      assertDeepEqual(
        after.value,
        applyAll(ctx, before.value, [fixtures.writes[0]], "optimistic"),
        "optimistic projection mismatch"
      )
      const local = await receipt.local
      invariant(local.ok, "local acceptance must resolve ok")
      const remote = await receipt.remote
      invariant(remote.ok, "remote outcome must resolve ok")
      invariant(
        controls.deliveries().length === 1,
        "exactly one delivery expected"
      )
      invariant(
        controls.executions().length === 1,
        "exactly one execution expected"
      )
      assertDeepEqual(
        controls.read(),
        after.value,
        "authority state must match the accepted prediction"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[1], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      const base = replica.getSnapshot().value
      const first = replica.mutate(fixtures.writes[0])
      const second = replica.mutate(fixtures.writes[1])
      assertDeepEqual(
        replica.getSnapshot().value,
        applyAll(ctx, base, [...fixtures.writes], "optimistic"),
        "back-to-back mutations must accumulate over the projection"
      )
      invariant((await first.remote).ok, "first remote must succeed")
      invariant((await second.remote).ok, "second remote must succeed")
      const deliveries = controls.deliveries()
      invariant(deliveries.length === 2, "two ordered deliveries expected")
      invariant(
        deliveries[1]!.mutationId === deliveries[0]!.mutationId + 1,
        "mutation IDs must be strictly sequential"
      )
      assertDeepEqual(
        controls.read(),
        replica.getSnapshot().value,
        "authority must converge with the projection"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[2], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      controls.failNextPush(1)
      const receipt = replica.mutate(fixtures.writes[0])
      const remote = await receipt.remote
      invariant(remote.ok, "remote must succeed after retry")
      const deliveries = controls.deliveries()
      invariant(deliveries.length === 2, "expected one retry delivery")
      assertDeepEqual(
        deliveries[0],
        deliveries[1],
        "retry must redeliver the identical envelope"
      )
      invariant(
        controls.executions().length === 1,
        "the retried mutation must execute once"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[3], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      const receipt = replica.mutate(fixtures.writes[0])
      invariant((await receipt.remote).ok, "delivery must succeed")
      const envelope = controls.deliveries()[0]
      invariant(envelope, "expected a delivered envelope")
      const redelivered = await controls.deliver(envelope)
      invariant(redelivered.ok, "duplicate must return the recorded outcome")
      invariant(
        controls.executions().length === 1,
        "duplicate delivery must not re-execute application code"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[4], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      controls.vetoNext(fixtures.vetoError)
      const receipt = replica.mutate(fixtures.writes[0])
      const remote = await receipt.remote
      const failure = remoteError(remote, "vetoed mutation")
      invariant(
        failure.kind === "rejected" &&
          deepEqual(failure.error, fixtures.vetoError),
        "veto must surface as a terminal rejection"
      )
      const envelope = controls.deliveries()[0]
      invariant(envelope, "expected a delivered envelope")
      const executions = controls.executions().length
      const replay = await controls.deliver(envelope)
      invariant(!replay.ok, "duplicate of a rejection must stay rejected")
      assertDeepEqual(
        replay.error,
        { kind: "rejected", error: fixtures.vetoError },
        "duplicate must reproduce the same terminal classification"
      )
      invariant(
        controls.executions().length === executions,
        "duplicate delivery must not re-execute application code"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[5], async (ctx) => {
      const { replica, fixtures, controls, identity } = ctx
      const receipt = replica.mutate(fixtures.writes[0])
      invariant((await receipt.remote).ok, "setup delivery must succeed")
      const delivered = controls.deliveries()[0]
      invariant(delivered, "expected a delivered envelope")
      const executions = controls.executions().length
      const gap: MutationEnvelope<Invocation> = {
        ...delivered,
        clientGroupId: identity.clientGroupId,
        clientId: identity.clientId,
        mutationId: delivered.mutationId + 2,
      }
      const outcome = await controls.deliver(gap)
      invariant(!outcome.ok, "a gap must be refused")
      invariant(
        outcome.error.kind === "gap",
        `expected a gap refusal, got ${outcome.error.kind}`
      )
      invariant(
        controls.executions().length === executions,
        "a gap must not execute application code"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[6], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      controls.pause()
      const first = replica.mutate(fixtures.writes[0])
      const second = replica.mutate(fixtures.writes[1])
      await controls.commitExternal(fixtures.external)
      await controls.publish()
      const snapshot = replica.getSnapshot()
      invariant(snapshot.pending === 2, "pending mutations must survive rebase")
      assertDeepEqual(
        snapshot.value,
        applyAll(ctx, controls.read(), [...fixtures.writes], "rebase"),
        "pending mutations must replay in ID order over the new base"
      )
      await controls.resume()
      invariant((await first.remote).ok, "first remote must still succeed")
      invariant((await second.remote).ok, "second remote must still succeed")
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[7], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      const receipt = replica.mutate(fixtures.writes[0])
      invariant((await receipt.remote).ok, "delivery must succeed")
      await controls.publish()
      const incorporated = replica.getSnapshot()
      invariant(incorporated.pending === 0, "incorporation must prune")
      assertDeepEqual(
        incorporated.value,
        controls.read(),
        "projection must equal the accepted base after pruning"
      )
      await controls.publish()
      assertDeepEqual(
        replica.getSnapshot().value,
        incorporated.value,
        "a re-published base must not re-apply the pruned mutation"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[8], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      const observed: State[] = []
      const unsubscribe = replica.subscribe(() => {
        observed.push(replica.getSnapshot().value)
      })
      controls.pause()
      replica.mutate(fixtures.writes[0])
      await controls.commitExternal(fixtures.external)
      const before = observed.length
      await controls.publish()
      invariant(
        observed.length === before + 1,
        "an accepted snapshot must publish exactly once"
      )
      const expected = applyAll(
        ctx,
        controls.read(),
        [fixtures.writes[0]],
        "rebase"
      )
      assertDeepEqual(
        observed[observed.length - 1],
        expected,
        "the published projection must already include the replay"
      )
      invariant(
        !observed
          .slice(before)
          .some((value) => deepEqual(value, controls.read())),
        "the bare base must never be observable before replay"
      )
      unsubscribe()
      await controls.resume()
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[9], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      const before = replica.getSnapshot()
      const receipt = replica.mutate(fixtures.refused)
      invariant(receipt.id === null, "a refused mutation consumes no identity")
      const local = await receipt.local
      const failure = remoteError(local, "refused local outcome")
      invariant(failure.kind === "refused", "local refusal must be typed")
      invariant(
        replica.getSnapshot() === before,
        "a refusal must not change the snapshot"
      )
      invariant(
        controls.deliveries().length === 0,
        "a refused mutation must never be delivered"
      )
      const followUp = replica.mutate(fixtures.writes[0])
      invariant(
        (await followUp.remote).ok,
        "the ID sequence must remain gapless after a refusal"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[10], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      const base = replica.getSnapshot().value
      controls.pause()
      controls.vetoNext(fixtures.vetoError)
      const first = replica.mutate(fixtures.writes[0])
      const second = replica.mutate(fixtures.writes[1])
      await controls.resume()
      const firstRemote = await first.remote
      const firstFailure = remoteError(firstRemote, "vetoed head")
      invariant(
        firstFailure.kind === "rejected" &&
          deepEqual(firstFailure.error, fixtures.vetoError),
        "head rejection must resolve with the authority's typed error"
      )
      invariant((await second.remote).ok, "later valid intent must survive")
      await eventually(() => {
        assertDeepEqual(
          replica.getSnapshot().value,
          applyAll(ctx, base, [fixtures.writes[1]], "rebase"),
          "rejected prediction must be rolled back under later intent"
        )
      })
      assertDeepEqual(
        controls.read(),
        replica.getSnapshot().value,
        "authority and projection must converge after rollback"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[11], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      controls.pause()
      const conflicted = replica.mutate(fixtures.conflicting.pending)
      const surviving = replica.mutate(fixtures.writes[0])
      invariant(
        replica.getSnapshot().conflicts.length === 0,
        "no conflict before the base moves"
      )
      await controls.commitExternal(fixtures.conflicting.external)
      await controls.publish()
      const snapshot = replica.getSnapshot()
      invariant(
        snapshot.conflicts.length === 1 &&
          snapshot.conflicts[0]!.id === conflicted.id,
        "replay refusal must surface a conflict for the refused mutation"
      )
      invariant(
        snapshot.pending === 1,
        "later valid intent must survive the conflicted replay"
      )
      assertDeepEqual(
        snapshot.value,
        applyAll(ctx, controls.read(), [fixtures.writes[0]], "rebase"),
        "the surviving projection must replay over the new base"
      )
      await controls.resume()
      await conflicted.remote
      invariant((await surviving.remote).ok, "surviving intent must deliver")
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[12], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      const base = replica.getSnapshot().value
      const observed: State[] = []
      const unsubscribe = replica.subscribe(() => {
        observed.push(replica.getSnapshot().value)
      })
      const receipt = replica.mutate(fixtures.writes[0])
      const predicted = replica.getSnapshot().value
      invariant((await receipt.remote).ok, "delivery must succeed")
      await controls.publish()
      const doubled = applyAll(ctx, predicted, [fixtures.writes[0]], "rebase")
      for (const value of observed) {
        invariant(
          !deepEqual(value, doubled),
          "the mutation must never apply twice"
        )
        invariant(
          !deepEqual(value, base),
          "the prediction must never flicker back to the old base"
        )
      }
      assertDeepEqual(
        replica.getSnapshot().value,
        controls.read(),
        "projection must settle on the accepted base"
      )
      unsubscribe()
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[13], async (ctx) => {
      const { replica, fixtures, controls, retryBudget } = ctx
      const base = replica.getSnapshot().value
      controls.failNextPush(retryBudget + 1)
      const receipt = replica.mutate(fixtures.writes[0])
      await eventually(() => {
        invariant(
          replica.getSnapshot().connection === "disconnected",
          "retry-budget exhaustion must transition to disconnected"
        )
      })
      const snapshot = replica.getSnapshot()
      invariant(snapshot.pending === 1, "the mutation must stay projected")
      assertDeepEqual(
        snapshot.value,
        applyAll(ctx, base, [fixtures.writes[0]], "optimistic"),
        "the projection must retain the ambiguous mutation"
      )
      invariant(
        await isUnsettled(receipt.remote),
        "an ambiguous outcome must never resolve remote"
      )
      invariant(
        controls.executions().length === 0,
        "no forced-failure delivery may have executed"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[14], async (ctx) => {
      const { replica, fixtures, controls, retryBudget } = ctx
      controls.failNextPush(retryBudget + 1)
      const head = replica.mutate(fixtures.writes[0])
      await eventually(() => {
        invariant(
          replica.getSnapshot().connection === "disconnected",
          "expected disconnection first"
        )
      })
      const headId = controls.deliveries()[0]!.mutationId
      const later = replica.mutate(fixtures.writes[1])
      await settle()
      invariant(
        controls.deliveries().every((e) => e.mutationId === headId),
        "later mutations must not deliver past an ambiguous head"
      )
      invariant(await isUnsettled(later.remote), "later remote must wait")
      invariant(await isUnsettled(head.remote), "head remote must wait")
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[15], async (ctx) => {
      const { replica, fixtures, controls, retryBudget } = ctx
      controls.failNextPush(retryBudget + 1)
      const receipt = replica.mutate(fixtures.writes[0])
      await eventually(() => {
        invariant(
          replica.getSnapshot().connection === "disconnected",
          "expected disconnection first"
        )
      })
      const attempts = controls.deliveries().length
      await settle()
      invariant(
        controls.deliveries().length === attempts,
        "delivery must stay paused while disconnected"
      )
      await controls.recover()
      const remote = await receipt.remote
      invariant(remote.ok, "recovery must settle the head's outcome")
      const deliveries = controls.deliveries()
      assertDeepEqual(
        deliveries[deliveries.length - 1],
        deliveries[0],
        "recovery must redeliver the identical envelope"
      )
      invariant(
        controls.executions().length === 1,
        "the recovered mutation must execute exactly once"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[16], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      controls.pause()
      controls.dropNextResult(1)
      const receipt = replica.mutate(fixtures.writes[0])
      await controls.flush(1)
      await settle()
      await controls.publish()
      const snapshot = replica.getSnapshot()
      invariant(
        snapshot.pending === 0,
        "incorporation must prune the prediction even with the outcome lost"
      )
      assertDeepEqual(
        snapshot.value,
        controls.read(),
        "projection must equal the accepted base"
      )
      invariant(
        await isUnsettled(receipt.remote),
        "the lost outcome must remain unresolved until recovered"
      )
      await controls.resume()
      const remote = await receipt.remote
      invariant(remote.ok, "redelivery must recover the recorded outcome")
      invariant(
        controls.executions().length === 1,
        "recovery must not re-execute"
      )
    }),

    law(REPLICA_CONTRACT_LAW_NAMES[17], async (ctx) => {
      const { replica, fixtures, controls } = ctx
      controls.pause()
      const receipt = replica.mutate(fixtures.writes[0])
      let notified = 0
      replica.subscribe(() => {
        notified += 1
      })
      const before = replica.getSnapshot()
      replica.dispose()
      const remote = await receipt.remote
      const failure = remoteError(remote, "disposed wait")
      invariant(
        failure.kind === "disposed",
        "outstanding waits must resolve disposed"
      )
      const post = replica.mutate(fixtures.writes[1])
      invariant(post.id === null, "mutations after dispose gain no identity")
      const postLocal = await post.local
      invariant(
        !postLocal.ok && postLocal.error.kind === "disposed",
        "mutations after dispose must fail locally with the disposed error"
      )
      await controls.publish()
      await settle()
      invariant(
        replica.getSnapshot() === before && notified === 0,
        "a disposed replica must not observe the stream"
      )
      await controls.resume()
    }),
  ]

  // The eighteen names above map to laws[0..17]; keep them aligned.
  const named = new Map(laws.map((l) => [l.name, l]))
  const ordered = REPLICA_CONTRACT_LAW_NAMES.map((name) => {
    const found = named.get(name)
    if (!found) throw new Error(`missing law implementation: ${name}`)
    return found
  })

  if (options.remoteMode === "recorded") {
    ordered.push(
      law(REPLICA_CONTRACT_RECORDED_LAW_NAME, async (ctx) => {
        const { replica, fixtures, controls } = ctx
        invariant(
          fixtures.expectedRemote !== undefined,
          "recorded mode requires fixtures.expectedRemote"
        )
        controls.pause()
        controls.dropNextResult(1)
        const receipt = replica.mutate(fixtures.writes[0])
        await controls.flush(1)
        await settle()
        await controls.commitExternal(fixtures.external)
        await controls.resume()
        const remote = await receipt.remote
        invariant(remote.ok, "redelivery must recover the recorded outcome")
        assertDeepEqual(
          remote.value,
          fixtures.expectedRemote,
          "the recorded remote result must be reproduced, not recomputed"
        )
        invariant(
          controls.executions().length === 1,
          "recovery must not re-execute"
        )
      })
    )
  }

  return ordered
}
