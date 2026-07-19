# UNN-638 — Predicted replica module technical design

Status: **Proposed** · 2026-07-18  
Related: [Zero mutation-interface study](unn-638-zero-api-study.md) · UNN-639

> **Design-review revision.** The first draft established the replica core. This
> revision promotes adapter authoring to a first-class package interface, specifies
> ambiguous delivery recovery, moves an unlike second binding ahead of broad Showtime
> migration, narrows accepted snapshots to the current client's watermark, and makes
> `Remote = void` the default.
>
> **Implementation revision (2026-07-18, UNN-639 PR #382).** The sink's
> `setConnection(status)` proved edge-shaped where the protocol is level-triggered:
> a duplicate-suppressing transport starves a parked replica of the "still alive,
> nothing new" signal. The implemented port replaces it with `alive()`
> (level-triggered, per successful source round-trip) and `down()`; the replica
> derives a two-state `ConnectionStatus` (`recovering` was never emitted and is
> gone), and any liveness evidence resumes delivery with a fresh retry epoch.
> The causal acceptance gate also gained a raced-recovery rule: an in-flight
> recovery result that is incomparable with a `last` that advanced re-reads;
> against an unchanged `last` it is dropped as an inconsistent source read.
> Interface sketches below predate this; the package is authoritative.

## Summary

Extract the client write-coordination machinery as a framework-independent
**predicted replica module**, not as a collection of queue, version-ref, and React
helpers.

The module maintains one authoritative base plus an ordered log of pending mutation
intents. It projects the pending intents over the base, delivers them with exactly-once
authority effects, accepts causally ordered authoritative snapshots, and rebases the
remaining intents after every accepted update.

Its daily caller interface is deliberately small. Remote success is acknowledgment-only
by default:

```ts
interface Replica<State, Invocation, Error, Remote = void> {
  getSnapshot(): ReplicaSnapshot<State, Error>
  subscribe(listener: () => void): () => void
  mutate(invocation: Invocation): MutationReceipt<Error, Remote>
  dispose(): void
}
```

This interface hides mutation identity, serialization, retry, deduplication, optimistic
projection, acknowledgment, rollback, and rebase. Deleting the module would spread
those decisions back across every caller, so it earns its place as a deep module.

An external package nevertheless has three consequential interfaces: the daily replica
interface, the transport port implemented by adapter authors, and the authority
processor. The transport port is part of the product, not application glue. The package
must provide ordering helpers and an executable adapter contract so each consumer does
not rebuild causal delivery unaided.

The package will begin in this workspace so Showtime can be its first production
adapter. Its interface should be publication-quality, but it should not be declared
stable or published as 1.0 until a second project supplies a real second adapter.

## Context

The [UNN-638 study](unn-638-zero-api-study.md) concluded that Zero's useful lesson is
not its table transaction syntax. It is the runtime behind the small
`mutate(invocation)` interface:

1. the runtime assigns ordered mutation identity,
2. it projects a mutation locally,
3. it delivers the mutation safely,
4. the authority deduplicates it transactionally,
5. accepted state returns through a separate channel, and
6. pending mutations replay over the new base.

The study originally recommended limiting UNN-639 to transport extraction because a
replica had only one known consumer. There are now multiple candidate projects for the
same machinery. That is enough evidence to design the deeper module and validate it
with a second consumer before stabilizing the interface.

Showtime currently distributes the same coordination knowledge across:

- per-class and per-character promise queues,
- monotonic version refs and maps,
- one-stale-retry dispatch,
- React optimistic frames,
- realtime version pings,
- snapshot refetch and race suppression, and
- route refresh reconciliation.

Extracting these primitives independently would preserve their coordination burden at
every call site. The proposed seam instead sits around the whole predicted-replica
lifecycle.

## Goals

- Give application callers one typed `mutate(invocation)` operation.
- Keep the projected value available through an external-store interface.
- Serialize local mutations and assign stable ordered identities internally.
- Make network redelivery safe through transactional authority-side deduplication.
- Separate local prediction, remote terminal outcome, and authoritative incorporation.
- Rebase pending mutation intents over causally newer authoritative state.
- Keep mutations with an ambiguous remote outcome pending across disconnection and
  resume delivery with the same identity.
- Preserve typed `Result` failures without requiring thrown domain errors.
- Keep React, Next.js, databases, authentication, and realtime vendors outside the
  core module.
- Make both the replica and transport port testable through the same interfaces used by
  production callers and adapters.

## Non-goals

- A client database or general query engine.
- Zero-compatible replication or adoption of Zero's transaction/table interface.
- Offline persistence, background sync, or cross-device outboxes in the first version.
- CRDTs, field-level merge policies, or automatic conflict resolution.
- Cross-replica transactions.
- Application authorization, redaction, or domain validation.
- Replacing Showtime's `EntityWrite`, Writers, Store, or guarded commit.
- A universal normalized cache.
- A stable public release before a second production-shaped consumer exists.

## Terms

- **Authoritative base** — the latest accepted state delivered by the authority.
- **Invocation** — a registered mutation name plus validated, serializable arguments.
- **Pending log** — locally accepted invocations not yet incorporated into the
  authoritative base.
- **Delivery ledger** — envelopes whose remote outcome is not yet known. An incorporated
  mutation may leave the pending log while remaining in this ledger long enough to
  recover its receipt.
- **Projected value** — the authoritative base with the pending log replayed in order.
- **Remote outcome** — the authority's terminal acceptance or typed rejection of one
  mutation delivery.
- **Unsettled delivery** — a mutation whose last attempt ended ambiguously, such as a
  timeout after the authority may have committed it. It remains pending and keeps the
  same identity.
- **Incorporation** — evidence that an authoritative base reflects the terminal outcome
  of a mutation. Incorporation is later than, and distinct from, remote acknowledgment.
- **Watermark** — the last mutation ID from this replica's client incorporated into an
  accepted base.

## Package shape

Examples use `@scope/replica` as a placeholder publication name.

```text
packages/replica/
  src/
    index.ts          # core interface and runtime
    transport.ts      # transport port, ordering helpers, adapter contracts
    react.ts          # useReplica, backed by useSyncExternalStore
    server.ts         # ordered deduplication processor
    testing.ts        # in-memory authority and both contract suites
```

Public entry points:

```ts
import { createReplica, defineMutation, defineMutations } from "@scope/replica"
import { useReplica } from "@scope/replica/react"
import { createMutationProcessor } from "@scope/replica/server"
import {
  createInMemoryAuthority,
  verifyReplicaContract,
  verifyTransportContract,
} from "@scope/replica/testing"
import {
  createCausalAcceptanceGate,
  createPullGenerationGate,
} from "@scope/replica/transport"
```

The core has no React or Next.js dependency. It uses the dependency-free
`@workspace/result` module for expected failures. Publishing externally therefore also
requires giving that dependency a publishable identity or bundling it without creating
a second `Result` authority.

Mutation argument schemas should satisfy Standard Schema so applications can continue
using Zod without making Zod a package dependency.

## Mutation definitions

A mutation definition owns the transport name, argument schema, and deterministic local
projection:

```ts
interface MutationDefinition<State, Name extends string, Args, ApplyError> {
  name: Name
  args: StandardSchemaV1<Args>
  apply(
    state: State,
    args: Args,
    context: { phase: "optimistic" | "rebase" }
  ): Result<State, ApplyError>
}
```

`defineMutation` returns both a definition for the registry and a typed invocation
factory. `defineMutations` combines the definitions into one registry and provides the
decoder used by the authority.

```ts
const writeEntity = defineMutation({
  name: "entity.write",
  args: entityWriteArgsSchema,
  apply(entity, { write }) {
    return applyEntityWrite(entity, write)
  },
})

const entityMutations = defineMutations([writeEntity])

const invocation = writeEntity({
  entityId,
  write: ENTITY_WRITERS.vitals.damage({ amount: 2 }),
})
```

Mutation names are the serialized protocol vocabulary. They must be stable across
compatible client and server deployments. Arguments must be serializable and validated
again at the authority seam.

The local `apply` function is a prediction, not authorization. The authority executes
an application-owned handler against trusted context and current persistence state.

## Replica interface

```ts
interface ReplicaSnapshot<State, Error> {
  value: State
  pending: number
  connection: "connected" | "recovering" | "disconnected"
  conflicts: readonly MutationConflict<Error>[]
}

interface MutationReceipt<Error, Remote = void> {
  id: MutationId
  local: Promise<Result<void, Error>>
  remote: Promise<Result<Remote, Error>>
}

interface Replica<State, Invocation, Error, Remote = void> {
  getSnapshot(): ReplicaSnapshot<State, Error>
  subscribe(listener: () => void): () => void
  mutate(invocation: Invocation): MutationReceipt<Error, Remote>
  dispose(): void
}
```

`getSnapshot` and `subscribe` form a standard external-store interface. The returned
snapshot is referentially stable until an observable value changes.

`mutate` is valid only while the replica is active. `dispose` unsubscribes from the
authority, aborts outstanding waits, and makes subsequent mutations fail locally with a
typed disposed error. It cannot undo an authority commit already in flight.

The receipt deliberately exposes two milestones:

- `local` resolves after validation, prediction, and insertion into the pending log.
- `remote` resolves after the authority records a terminal outcome.

Neither promise means that an accepted snapshot has incorporated the mutation. The
replica keeps the predicted effect mounted until incorporation arrives through the
accepted-state stream.

`disconnected` describes delivery during the lifetime of an in-memory replica; it does
not promise reload-surviving offline support. Pending mutations remain projected but no
delivery attempt is active. `recovering` means the transport has reconnected but has not
yet re-established accepted state. Delivery resumes only after recovery completes.

## Creating a replica

```ts
const replica = createReplica({
  initial: loadedEntity,
  mutations: entityMutations,
  transport: createEntityTransport({ entityId }),
})
```

The initial value and every subsequent accepted value have this shape:

```ts
interface Accepted<State, Cursor = unknown> {
  value: State
  through: MutationId
  cursor: Cursor
}
```

`through = 42` means the base reflects the terminal outcome of every mutation from this
replica's client through ID 42. Accepted mutations are present in the base; rejected
mutations have no effect in the base. This wording permits the stream to advance after a
rejection even when application state itself did not change.

The transport binds one replica to one client identity and narrows the authority's
per-client ledger to that client's watermark. Accepted snapshots do not carry an
ever-growing `Record<ClientId, MutationId>`. A future shared durable outbox may justify
a wider group watermark, but the first interface should not pay for that unimplemented
cardinality.

`cursor` is an adapter-owned causal token for the domain value. The replica carries it
but does not compare or interpret it; the transport's acceptance gate combines it with
`through` to prevent regression of either domain state or protocol progress. A terminal
rejection can advance `through` without changing `cursor`, so cursor equality alone does
not make two accepted snapshots duplicates.

The watermark is required for correct pruning. A domain row version alone cannot tell
the replica whether a returned snapshot already contains a particular local mutation.
Replaying an incorporated mutation could otherwise apply it twice.

The authority read adapter must obtain `value`, `through`, and `cursor` from one
consistent observation. Pairing a newer watermark with an older domain snapshot could
prune a mutation whose effect is absent; pairing newer state with an older watermark
could replay it twice. The transport contract treats the accepted tuple as atomic.

## Transport port

The authority is remote but owned. The replica therefore defines one port at the seam,
with a production network adapter and an in-memory testing adapter. This is the primary
interface for package adopters: the package is only deep if it helps adapters establish
one causal accepted-state stream instead of moving today's race machinery into every
consumer.

```ts
interface ReplicaTransport<
  State,
  Invocation,
  Error,
  Remote = void,
  Cursor = unknown,
> {
  connect(sink: ReplicaTransportSink<State, Cursor>): () => void

  push(
    envelope: MutationEnvelope<Invocation>,
    signal: AbortSignal
  ): Promise<Result<Remote, PushError<Error>>>
}

interface ReplicaTransportSink<State, Cursor> {
  accept(accepted: Accepted<State, Cursor>): void
  setConnection(status: "connected" | "recovering" | "disconnected"): void
}

type PushError<Error> =
  | { kind: "retryable"; cause: unknown }
  | { kind: "rejected"; error: Error }
```

`retryable` means the authority outcome is unknown, not that the authority is known to
have skipped the mutation. Only `rejected` is a trusted terminal refusal.

The transport adapter must deliver accepted snapshots in causal order. HTTP request
races, polling generations, reconnect cursors, and vendor-specific message ordering
remain adapter decisions because only the adapter understands its source. The package
owns the stateful enforcement machinery and contract tests so those decisions are made
once per adapter rather than reimplemented in every callback.

The replica calls `push` serially for one client. A retry uses the exact same envelope.
A terminal rejection does not poison the queue; it removes that mutation, rebases later
pending mutations over the unchanged base, and resolves its receipt with the typed
error.

### Adapter-authoring helpers

`@scope/replica/transport` provides composable guards for the two common sources of
causal regression:

```ts
const generation = createPullGenerationGate()

const acceptance = createCausalAcceptanceGate({
  initial: loadedEntity,
  classify: compareEntityCursor,
  recover: refetchCurrentSnapshot,
  emit: sink.accept,
})
```

`createPullGenerationGate` issues a generation for each overlapping pull and allows
only the latest still-relevant request to publish. It centralizes cancellation and the
“older response finished last” race.

`createCausalAcceptanceGate` remembers the last emitted accepted snapshot. Its
application-supplied classifier describes the relationship between the old and incoming
**domain cursors**:

```ts
type CausalRelationship = "stale" | "same" | "fresh" | "unknown"
```

- `stale` with an equal or older watermark does not emit; a newer watermark paired with
  stale domain state is incomparable and starts recovery.
- `same` with an older watermark is stale, with the same watermark is a duplicate, and
  with a newer watermark emits. The last case is how a terminal rejection becomes
  observable without a domain-state change.
- `fresh` emits when the watermark is equal or newer; a regressing watermark starts
  recovery.
- `unknown` does not guess; it starts the configured recovery read.

An identical cursor and watermark is a duplicate and does not emit. These product-order
rules live in the package; adapters do not reimplement them.

This permits a scalar cursor, a vector such as Showtime's multi-dimensional versions,
or another project-specific token without forcing one comparison model into the core.
The helper owns duplicate suppression, recovery serialization, cancellation, and
publication; the adapter supplies only the domain-specific classification and read.

Adapters that consume ordered deltas must fold them into complete `Accepted<State>`
values before crossing the port. The replica intentionally does not interpret vendor
events or partial patches.

### Transport contract suite

`verifyTransportContract` is a named deliverable of `@scope/replica/testing`. An
adapter supplies a controllable harness for its source and the suite verifies that the
port:

- establishes a gapless continuation from the supplied initial cursor, or emits a
  current accepted snapshot, before reporting `connected`,
- suppresses a slower result from an older pull generation,
- never emits a causally stale or duplicate accepted snapshot,
- recovers rather than guessing when cursors are incomparable,
- resumes from a reconnect cursor or performs a current-state recovery read,
- preserves the accepted value and its `through` watermark as one observation,
- preserves an envelope exactly when the caller redelivers it after an ambiguous push
  result,
- reports terminal rejection separately from ambiguous transport failure,
- stops all emissions after disconnect/disposal, and
- fails a deliberate adapter that publishes pull responses in completion order.

The suite must run against Showtime's production-shaped adapter and the deliberately
alien polling adapter described in the migration plan. Vendor integration tests may add
coverage, but they do not replace this deterministic contract.

## Mutation identity

Application callers never create idempotency keys. The runtime adds transport identity:

```ts
interface MutationEnvelope<Invocation> {
  clientGroupId: string
  clientId: string
  mutationId: number
  invocation: Invocation
}
```

- `clientGroupId` identifies replicas that share persisted client state.
- `clientId` identifies one ordered producer within that group.
- `mutationId` is strictly monotonic per client and begins at one.

The first version may keep identity and the pending log in memory. Offline or
reload-surviving delivery would require a persistence adapter and is deliberately
deferred. The envelope is compatible with adding that persistence later.

## Authority-side processing

The server entry point parses an envelope, enforces ordering and deduplication, invokes
an application handler in trusted context, and stores the terminal outcome atomically:

```ts
const processEntityMutation = createMutationProcessor({
  mutations: entityMutations,
  transact: withDatabaseTransaction,
  dedup: postgresMutationDedup,
  execute: executeEntityMutation,
})

const result = await processEntityMutation(envelope, trustedContext)
```

The authority processor is parameterized by the application's transaction type:

```ts
interface MutationProcessorOptions<
  Registry,
  Transaction,
  TrustedContext,
  Error,
  Remote = void,
> {
  mutations: Registry
  transact<T>(work: (tx: Transaction) => Promise<T>): Promise<T>
  dedup: MutationDedupAdapter<Transaction, Remote, Error>
  execute(
    tx: Transaction,
    invocation: InvocationOf<Registry>,
    context: TrustedContext
  ): Promise<Result<Remote, Error>>
}
```

Inside one application transaction, the processor:

1. locks or serializes the dedup record for the client,
2. returns the recorded outcome when this ID was already processed,
3. rejects a gap when the ID is greater than `lastMutationId + 1`,
4. executes the application handler when the ID is next,
5. records the terminal outcome and advances the watermark, and
6. commits the domain write and dedup state together.

Unexpected exceptions abort the transaction and do not advance the watermark. They are
retryable only when the production adapter classifies them that way.

### Remote result modes

The package defaults to `Remote = void`. A successful redelivery then needs only the
recorded fact that the mutation terminated; accepted versions and state arrive through
the accepted-state stream. This keeps the normal authority adapter close to Zero's
acknowledgment semantics and avoids making serialized success-result storage a hidden
cost for every adopter.

The dedup record must retain the last terminal outcome long enough to recover an
ambiguous delivery. For the default mode, that is an accepted marker or the typed
terminal rejection. Because the client never advances to mutation N+1 until N's remote
outcome is known, retaining the current terminal outcome per client is sufficient for
the in-memory delivery model. Durable or concurrently delivered outboxes may require a
longer outcome log.

Non-void `Remote` is an advanced opt-in. At the point where an adapter selects it, the
authority adapter must also provide serialized outcome storage for the full recovery
window. A redelivery must reproduce the original result; reconstructing it from current
domain state is invalid because later mutations may already have changed that state.

Showtime may temporarily opt into `Remote = EntityCommit` during migration. Its target
binding should use the default `void` result and derive accepted versions from the
accepted-state stream.

## Client state machine

### Local mutation

1. Validate the invocation through its registered schema.
2. Assign the next mutation ID.
3. Apply it to the current projected value.
4. On refusal, resolve `local` with `Result.err` and do not enqueue it.
5. On success, append it to the pending log, publish the projected value, resolve
   `local`, and wake the delivery loop.

Back-to-back mutations apply to the projection produced by earlier pending mutations,
not merely to the last authoritative base.

### Remote terminal outcome

1. Deliver only the head unsent mutation for the client.
2. Retry an ambiguous failure with the same identity according to a bounded
   per-connection policy.
3. On terminal acceptance, resolve `remote`; retain the mutation in the pending log
   until an accepted snapshot incorporates it.
4. On terminal rejection, resolve `remote` with `Result.err`, remove the predicted
   mutation, and replay later pending mutations over the current base.

### Ambiguous delivery and retry exhaustion

A timeout, connection loss, or cancelled response is not a terminal rejection. The
authority may already have committed the mutation. The replica must not resolve
`remote`, remove the prediction, allocate a replacement ID, or advance to the next
mutation.

Retry is bounded **per connection epoch**, not per mutation:

1. retry the same envelope within the current budget,
2. when that budget is exhausted, transition to `disconnected`,
3. keep the mutation projected and its `remote` promise unresolved,
4. pause later deliveries to preserve ordering,
5. on reconnect, transition to `recovering` and obtain a current accepted snapshot,
6. rebase or prune the prediction from that snapshot, then
7. redeliver the same envelope to recover its recorded terminal outcome.

An incorporated mutation may leave the projection before its lost remote outcome has
been recovered. The implementation therefore keeps receipt/delivery bookkeeping
separate from the pending projection log until `remote` settles. Authority
deduplication makes this recovery redelivery safe.

Only a trusted terminal response may resolve `remote` as accepted or rejected. A
retryable transport error never becomes a domain error merely because a budget elapsed.
Exact backoff values and connection-health detection are implementation decisions; the
unsettled-state behavior is part of the interface.

The first version does not persist this state across replica disposal or page reload.
That is the limit expressed by the offline-persistence non-goal. Dedup outcome retention
must nevertheless exceed the recovery window promised by any future durable outbox.

### Accepted snapshot

1. Replace the authoritative base.
2. Prune each local pending mutation at or below the snapshot watermark.
3. Replay all remaining mutations in ID order.
4. Publish the resulting projection once.

If a mutation's `apply` function refuses during replay, remove its predicted effect,
record a conflict in the replica snapshot, and continue replaying later mutations over
the surviving projection. Its server delivery may still be in flight; the authority's
terminal result remains decisive.

This state transition must be atomic from subscribers' perspective. They must never
observe the new base before pending mutations have been replayed.

## Replayable and preconditioned intent

The module does not expose separate `enqueue` and `enqueueOnce` operations. Replay
semantics belong to the mutation intent.

A generally replayable command describes an operation such as “apply two damage.” A
preconditioned command includes the observed fact that gives the operation its meaning:

```ts
const spendResource = defineMutation({
  name: "entity.spend-resource",
  args: spendResourceSchema,
  apply(entity, command) {
    if (entity.resources.version !== command.expectedVersion) {
      return err({ kind: "conflict" })
    }

    return spend(entity, command.amount)
  },
})
```

If a newer base invalidates the precondition, replay produces a typed conflict instead
of silently applying old intent to a new semantic state. The authority independently
checks the precondition against current trusted state.

Idempotent delivery and replayable intent remain separate guarantees:

- mutation identity prevents one accepted envelope from executing twice;
- the mutation definition decides whether an unincorporated intent remains meaningful
  after the base changes.

## React adapter

The React entry point should contain one thin binding:

```ts
function useReplica<State, Error>(
  replica: Replica<State, unknown, Error>
): ReplicaSnapshot<State, Error> {
  return useSyncExternalStore(
    replica.subscribe,
    replica.getSnapshot,
    replica.getSnapshot
  )
}
```

The application owns where a replica instance lives and may provide it through a
domain-specific context. A replica must not be recreated during render. The runtime that
creates it also owns `dispose`, matching subscription and cancellation state to the
correct lifetime.

## Showtime binding

The first production binding uses `entity.write` for Showtime's existing `EntityWrite`
vocabulary and, as classified in UNN-648, one `entity.setColumn` desired-value mutation
for the app-owned name/pronouns/notes/portrait-removal species. The second name records
a real semantic distinction—component Writer intent versus app-column intent—without
creating one transport method per Writer or storage field.

```ts
const entityReplica = createReplica({
  initial: acceptedEntity,
  mutations: defineMutations([writeEntity, setEntityColumn]),
  transport: createShowtimeEntityTransport({ entityId }),
})

const receipt = entityReplica.mutate(writeEntity({ entityId, write }))
```

The call site does not know about `VersionClass`, expected row versions, queue lanes,
mutation identity, stale retry, Ably, or route refresh. Finalize and portrait upload are
deliberately outside the mutation registry: the application waits for current replica
writes, captures an identity-version precondition, and invokes each lifecycle action
once. Builder step is an unversioned subtype LWW action.

### Extraction map

| Current responsibility                                        | Destination                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `write-queue.ts` serialization and stale retry                | Replica delivery loop and rebase                                  |
| `use-queued-write.ts`                                         | Replaced by `replica.mutate` + React binding                      |
| `version-token-store.ts` write coordination                   | Replaced by accepted base + watermark                             |
| `use-monotonic-version-ref.ts` write coordination             | Replaced by replica state                                         |
| `use-entity-write.tsx` prediction, refs, queues, and dispatch | Replica; app retains entity context and error policy              |
| `use-combatant-write.ts` optimistic Writer dispatch           | Replica; app retains console/container integration                |
| `write-lanes.ts` per-PC queues and token maps                 | Replica; app retains the durable-versus-inline ownership decision |
| Snapshot race suppression                                     | Package ordering helpers configured by Showtime's adapter         |
| Ably subscription and polling                                 | Showtime adapter, verified by the transport contract              |
| Fetch functions and Server Actions                            | Showtime transport adapter                                        |
| `guard-write-transition.ts`                                   | Application UI policy                                             |
| `run-dual-versioned-write.ts`                                 | Application unless both records become one replica root           |
| Writers, schemas, merge algebra, and `resolveEntity`          | Showtime domain                                                   |
| Authentication, Store, Drizzle, and guarded commit            | Showtime authority adapter                                        |
| Fog/redaction and protected routing                           | Showtime authority and read adapters                              |

Across `apps/web/lib/sync` and the main entity/combat write consumers, the current
production coordination surface is approximately 1,786 lines. The replica is expected
to absorb or eliminate roughly 700–1,000 of those lines plus their implementation-level
tests. This is a responsibility estimate, not a line-count target; the module earns its
place through the decisions it hides.

### Replica roots

A replica root must contain every fact needed to project one mutation deterministically.
The Showtime owner root contains the loaded components used by `applyEntityWrite` plus
the four owner-visible app columns. Name and portrait are synchronized with their lifted
`identity`/`presentation` components by the column mutation and by the snapshot assembly
seam; pronouns and notes remain profile-only columns.

Combat presents two different persistence homes: durable PC state and inline encounter
state. The app must decide that distinction once and return the appropriate replica.
The general module should not learn about combatant types or version classes.

Operations that atomically change two roots remain application commands unless the
roots are deliberately combined. The first version will not coordinate distributed or
cross-replica transactions.

### Redacted state

Client prediction is valid only when the client has enough state to run the transition.
Fogged or partially redacted surfaces must not receive hidden authority state merely to
fit this module. They may use a narrower projection function or remain server-driven.
Authorization and secrecy take precedence over replica uniformity.

## Testing strategy

The interfaces are the test surfaces. `@scope/replica/testing` ships two named contract
suites plus an in-memory authority. Tests do not reach through either interface to
assert on private queues, cursors, or reducer frames.

### Replica contract

The reusable behavior suite must prove:

- the first local mutation projects synchronously and is delivered once,
- back-to-back mutations serialize and accumulate over the projected value,
- retry redelivers the same envelope identity,
- authority deduplication prevents duplicate execution,
- a duplicate returns the same terminal classification,
- non-void result mode reproduces the original terminal result,
- an ID gap is rejected without executing application code,
- an external accepted snapshot rebases pending mutations in order,
- an incorporated mutation is pruned exactly once,
- accepted-base replacement and replay publish atomically,
- local refusal never enters the pending log,
- terminal remote rejection rolls back its prediction and preserves later valid intent,
- replay refusal surfaces a conflict without corrupting later replay,
- accepted snapshots arriving around remote acknowledgment do not flicker or double
  apply,
- retry-budget exhaustion leaves the mutation projected and `remote` unresolved,
- later mutations remain blocked while the head outcome is ambiguous,
- reconnect obtains accepted state and redelivers the same envelope,
- incorporation may prune prediction before the lost remote outcome is recovered,
- disposal unsubscribes and cancels outstanding waits, and
- a deliberate negative control makes the rebase and dedup laws fail.

### Transport adapter contract

`verifyTransportContract` exercises causal ordering, pull generations, reconnect
recovery, watermark/value atomicity, envelope identity, and disposal through the port.
Its required cases are defined in §Transport contract suite. Every production adapter
must run it; passing only the replica contract with the in-memory transport is
insufficient.

The package ships an intentionally alien reference fixture alongside the suite:

- collection-valued state rather than one entity,
- scalar HTTP cursor rather than Showtime's version vector,
- polling rather than Ably invalidation,
- `Remote = void`, and
- no React binding.

This is not evidence equal to a production consumer, but it is an early falsification
tool. It must use only the public transport and replica interfaces and must pass both
contract suites before broad Showtime migration begins.

Showtime keeps domain-law tests for `EntityWrite`, Writer application, merge, and
commit/reload equivalence. Existing tests of queues and version refs should be deleted
as their responsibilities move; layering those old tests under the new interface would
freeze the previous implementation shape.

## Migration plan

### Phase 1 — Three interfaces and their contracts

- Create `packages/replica` with the core, transport, server, React, and testing entry
  points.
- Move the disposable Zero mock's behavior into interface-level tests.
- Implement the pull-generation and causal-acceptance helpers.
- Ship `verifyReplicaContract` and `verifyTransportContract`, each with a deliberate
  negative control.
- Implement identity, pending log, delivery ledger, projection, deduplication, and
  rebase in memory.
- Prove ambiguous delivery, disconnection, recovery, and remote-outcome retrieval.

### Phase 2 — Two unlike bindings before broad migration

- Build the collection-valued, polling, `Remote = void`, non-React reference binding.
- Build one low-risk Showtime entity binding with its multi-dimensional cursor and
  Ably/refetch transport.
- Run both contract suites against both transport shapes.
- Change the external interfaces when either binding needs internal access; do not add
  an escape hatch for one consumer.
- Treat the alien binding as falsification evidence, not as the eventual proof required
  for a stable public release.

### Phase 3 — Showtime entity coordination

- Register `entity.write` around the existing `EntityWrite` schema and Writer reducer.
- Register `entity.setColumn` for replayable owner-column desired-value intent and widen
  the accepted root to include those columns.
- Add the authority dedup schema and transaction adapter.
- Extend accepted entity snapshots with the current replica's watermark and causal
  cursor.
- Bind current Server Actions and accepted-state delivery behind the transport port.
- Move remaining replayable entity writes onto the replica.
- Keep finalize and portrait upload single-attempt with an identity-version precondition
  captured after current replica writes settle; keep builder step as subtype LWW.
- Remove superseded per-class queues, token refs, stale retry, and implementation tests.
- Retain gated lifecycle and destructive UI behavior even when their transport uses the
  replica.

### Phase 4 — Combat binding

- Resolve durable and inline combatants to the correct replica at the existing ownership
  decision point.
- Remove per-PC queue/token machinery where the replica now owns it.
- Keep cross-root commands and redacted views application-specific.

### Phase 5 — Publication hardening

- Supplement the deliberately alien fixture's evidence with a production-shaped
  adapter in one other project.
- Compare required changes at the external interface rather than granting access to
  internals.
- Stabilize naming, persistence requirements, and error taxonomy from two real
  consumers.
- Publish only after the second adapter passes both contract suites.

## Rollout and compatibility

Transport and authority contracts must support mixed deployments:

1. deploy dedup persistence and compatible readers,
2. deploy authority handlers that accept mutation envelopes,
3. expose personalized accepted snapshots with the current replica's watermark and
   causal cursor,
4. migrate clients by write family,
5. observe duplicate, gap, retry, conflict, and rebase metrics, and
6. remove the old version-token path only after no old clients depend on it.

During migration, old and new writers may target the same rows. Old writes do not carry
replica identity, so every resulting accepted snapshot must still rebase pending replica
mutations. Rollback remains possible until the old path and its server contract are
removed.

## Observability

The implementation should emit structured events internally for an application adapter
to record without making a logging dependency part of the interface:

- mutation assigned, locally refused, sent, retried, remotely settled, and incorporated;
- duplicate and gap detection;
- accepted snapshot and number of mutations replayed;
- replay conflict;
- connection transition; and
- replica disposal with pending count.

Events must avoid logging mutation arguments by default because they may contain
private game or application data.

## Risks and mitigations

| Risk                                                                      | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A small `mutate` wrapper hides the old queues without earning true rebase | Do not remove token/reconciliation code until accepted bases and watermarks are live.                                                 |
| Retry exhaustion is mistaken for rejection                                | Keep the head unsettled, pause the ordered queue, recover accepted state, and redeliver the same ID after reconnect.                  |
| Duplicate delivery returns a different non-void result                    | Default to `Remote = void`; advanced adapters store the terminal result and never reconstruct it from newer state.                    |
| A snapshot double-applies a committed mutation                            | Require the current replica's incorporation watermark.                                                                                |
| Per-client watermarks grow without bound on the wire                      | Personalize accepted snapshots to the current replica's client; retain the wider ledger only at the authority.                        |
| A stale transport response regresses the base                             | Ship causal/generation guards and require every adapter to pass `verifyTransportContract`.                                            |
| Replaying a lifecycle command changes its meaning                         | Encode its observed precondition in the mutation arguments and surface typed conflict.                                                |
| Prediction leaks or requires hidden state                                 | Keep redacted surfaces narrower or server-driven.                                                                                     |
| The package becomes a framework adapter collection                        | Keep vendor code in application adapters while treating adapter-authoring helpers and contracts as first-class package functionality. |
| One consumer dictates a false generalization                              | Exercise the alien binding before broad migration and a second real project before stabilization.                                     |
| Publication creates two `Result` types                                    | Preserve `@workspace/result` as the single authority and plan its packaging with replica publication.                                 |

## Open decisions

These decisions should be made with implementation or second-consumer evidence, not in
the abstract:

1. The external package and npm scope name.
2. Whether the first public version supports a durable identity/pending-log adapter.
3. The default retry budget and which transport failures are retryable.
4. Dedup outcome retention and cleanup policy.
5. Whether conflict history is retained until acknowledged or exposed only as current
   snapshot state.
6. **Resolved (UNN-646).** The entity binding uses the default `Remote = void`; the
   combat session door is the first production non-void `Remote` (`{ version }` — the
   committed encounter version, recorded with the outcome, reproduced verbatim on
   deduplicated redelivery, and folded into the console's surviving event-queue token so
   the two protocols sharing the encounter row keep each other fresh). The recorded-mode
   replica-contract law runs against it.
7. **Resolved (UNN-646), with the rule the combat evidence produced: replica granularity
   follows the authority's commit scope — the row-lock + auth boundary — never the UI's
   dispatch scope.** Read the rule strictly: the commit scope is *every* lock the commit
   needs, not the most obvious one. The first implementation read it loosely and gave the
   durable root only the entity row's lock, even though a durable combat write is licensed
   by encounter liveness and roster membership — facts on the encounter row. Those
   preconditions were checked outside the committing transaction, so an end-combat sweep or
   a participant removal could land in between and the delivery would still commit. The
   durable transaction now locks `replicaClient → encounters → entity`. The granularity
   conclusion is unchanged; the boundary that justifies it is wider than first recorded.
   Durable combat state → one replica per entity row (own lock, own
   auth answer, own cursor, own lifetime); inline encounter state → one collection-valued
   replica per encounter (one row, one scalar version, one gate, one lifetime); transport
   fan-in is orthogonal — the console's single realtime subscription fans into N
   transports without merging roots. Caveat recorded: the inline replica's justification
   is at-most-once delivery and decision-point uniformity, not multi-writer evidence.
   Full decision record: `apps/web/domain/combat/replica/AGENTS.md`.
8. **Resolved (UNN-645/646).** The entity roots (owner and combat-durable) expose the
   per-class version vector with a product-order classifier (`unknown` on mixed
   dimensions → recovery read); the inline combat root exposes the scalar encounter
   version (totally ordered, so the incomparable-cursor law is structurally omitted for
   it, matching the alien polling precedent).
9. Which other project will provide the second production adapter.

## Acceptance criteria

The proposal is implemented when:

- application call sites express only typed mutation intent;
- the replica owns prediction, ordered delivery, retry, acknowledgment, and rebase;
- the authority records dedup state atomically with domain outcomes;
- accepted snapshots carry the current replica's incorporation watermark and a causal
  cursor;
- the replica and transport contract suites pass against the in-memory, alien, and
  Showtime adapters;
- ambiguous delivery remains unsettled across disconnection and recovers with the same
  mutation identity;
- replayable and preconditioned mutation families have explicit tests;
- old queues and version-token coordination are removed only where the replica fully
  replaces their contracts; and
- a second project validates the external interface before a stable publication.
