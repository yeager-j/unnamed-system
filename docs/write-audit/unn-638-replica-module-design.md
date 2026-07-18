# UNN-638 — Predicted replica module technical design

Status: **Proposed** · 2026-07-18  
Related: [Zero mutation-interface study](unn-638-zero-api-study.md) · UNN-639

## Summary

Extract the client write-coordination machinery as a framework-independent
**predicted replica module**, not as a collection of queue, version-ref, and React
helpers.

The module maintains one authoritative base plus an ordered log of pending mutation
intents. It projects the pending intents over the base, delivers them with exactly-once
authority effects, accepts causally ordered authoritative snapshots, and rebases the
remaining intents after every accepted update.

Its daily caller interface is deliberately small:

```ts
interface Replica<State, Invocation, Remote, Error> {
  getSnapshot(): ReplicaSnapshot<State, Error>
  subscribe(listener: () => void): () => void
  mutate(invocation: Invocation): MutationReceipt<Remote, Error>
  dispose(): void
}
```

This interface hides mutation identity, serialization, retry, deduplication, optimistic
projection, acknowledgment, rollback, and rebase. Deleting the module would spread
those decisions back across every caller, so it earns its place as a deep module.

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
- Preserve typed `Result` failures without requiring thrown domain errors.
- Keep React, Next.js, databases, authentication, and realtime vendors outside the
  core module.
- Make the module testable through the same interface used by production callers.

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
- **Projected value** — the authoritative base with the pending log replayed in order.
- **Remote outcome** — the authority's terminal acceptance or typed rejection of one
  mutation delivery.
- **Incorporation** — evidence that an authoritative base reflects the terminal outcome
  of a mutation. Incorporation is later than, and distinct from, remote acknowledgment.
- **Watermark** — the last mutation ID incorporated into a base for each client.

## Package shape

Examples use `@scope/replica` as a placeholder publication name.

```text
packages/replica/
  src/
    index.ts          # core interface and runtime
    react.ts          # useReplica, backed by useSyncExternalStore
    server.ts         # ordered deduplication processor
    testing.ts        # in-memory authority and reusable behavior laws
```

Public entry points:

```ts
import { createReplica, defineMutation, defineMutations } from "@scope/replica"
import { useReplica } from "@scope/replica/react"
import { createMutationProcessor } from "@scope/replica/server"
import { createInMemoryAuthority } from "@scope/replica/testing"
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
  connection: "online" | "offline" | "syncing"
  conflicts: readonly MutationConflict<Error>[]
}

interface MutationReceipt<Remote, Error> {
  id: MutationId
  local: Promise<Result<void, Error>>
  remote: Promise<Result<Remote, Error>>
}

interface Replica<State, Invocation, Remote, Error> {
  getSnapshot(): ReplicaSnapshot<State, Error>
  subscribe(listener: () => void): () => void
  mutate(invocation: Invocation): MutationReceipt<Remote, Error>
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
interface Accepted<State> {
  value: State
  through: MutationWatermark
}

type MutationWatermark = Readonly<Record<ClientId, MutationId>>
```

`through[clientId] = 42` means the base reflects the terminal outcome of every mutation
from that client through ID 42. Accepted mutations are present in the base; rejected
mutations have no effect in the base. This wording permits the stream to advance after a
rejection even when application state itself did not change.

The watermark is required for correct pruning. A domain row version alone cannot tell
the replica whether a returned snapshot already contains a particular local mutation.
Replaying an incorporated mutation could otherwise apply it twice.

## Transport port

The authority is remote but owned. The replica therefore defines one port at the seam,
with a production network adapter and an in-memory testing adapter.

```ts
interface ReplicaTransport<State, Invocation, Remote, Error> {
  connect(sink: ReplicaTransportSink<State>): () => void

  push(
    envelope: MutationEnvelope<Invocation>,
    signal: AbortSignal
  ): Promise<Result<Remote, PushError<Error>>>
}

interface ReplicaTransportSink<State> {
  accept(accepted: Accepted<State>): void
  setConnection(status: "online" | "offline" | "syncing"): void
}

type PushError<Error> =
  | { kind: "retryable"; cause: unknown }
  | { kind: "rejected"; error: Error }
```

The transport adapter must deliver accepted snapshots in causal order. HTTP request
races, polling generations, reconnect cursors, and vendor-specific message ordering are
adapter responsibilities. This keeps multi-dimensional Showtime version comparison out
of the general module while giving the module one reliable accepted-state stream.

The replica calls `push` serially for one client. A retry uses the exact same envelope.
A terminal rejection does not poison the queue; it removes that mutation, rebases later
pending mutations over the unchanged base, and resolves its receipt with the typed
error.

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
  Remote,
  Error,
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

### Deduplicated remote results

The `remote` result creates a stronger requirement than Zero's acknowledgment-only
success: a redelivery must reproduce the original terminal result. The dedup adapter
must therefore retain enough information to return that result, or the binding must use
`Remote = void`.

For Showtime, the long-term replica binding should prefer `Remote = void` and derive
accepted versions from the accepted-state stream. During migration, retaining
`EntityCommit` is permitted, but its serialized outcome must be stored for the dedup
retention window. Reconstructing an old result from current domain state is invalid
because later mutations may already have changed it.

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
2. Retry a retryable failure with the same identity according to a bounded internal
   policy.
3. On acceptance, resolve `remote`; retain the mutation in the pending log until an
   accepted snapshot incorporates it.
4. On terminal rejection, resolve `remote` with `Result.err`, remove the predicted
   mutation, and replay later pending mutations over the current base.

The default retry policy must be bounded and cancellable. Exact backoff values are an
implementation decision, not part of the daily caller interface.

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
  replica: Replica<State, unknown, unknown, Error>
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

The first production binding uses one `entity.write` mutation whose arguments contain
Showtime's existing `EntityWrite`. It preserves the current domain vocabulary rather
than creating one transport method per Writer arm.

```ts
const entityReplica = createReplica({
  initial: acceptedEntity,
  mutations: defineMutations([writeEntity]),
  transport: createShowtimeEntityTransport({ entityId }),
})

const receipt = entityReplica.mutate(writeEntity({ entityId, write }))
```

The call site does not know about `VersionClass`, expected row versions, queue lanes,
mutation identity, stale retry, Ably, or route refresh.

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
| Snapshot race suppression                                     | Showtime transport adapter                                        |
| Ably subscription and polling                                 | Showtime transport adapter                                        |
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
The initial Showtime root is the loaded entity used by `applyEntityWrite`.

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

The interface is the test surface. The package's in-memory authority is a real second
adapter for the owned remote seam, not a mock of internal methods.

The reusable behavior suite must prove:

- the first local mutation projects synchronously and is delivered once,
- back-to-back mutations serialize and accumulate over the projected value,
- retry redelivers the same envelope identity,
- authority deduplication prevents duplicate execution,
- a duplicate returns the original terminal result,
- an ID gap is rejected without executing application code,
- an external accepted snapshot rebases pending mutations in order,
- an incorporated mutation is pruned exactly once,
- accepted-base replacement and replay publish atomically,
- local refusal never enters the pending log,
- terminal remote rejection rolls back its prediction and preserves later valid intent,
- replay refusal surfaces a conflict without corrupting later replay,
- accepted snapshots arriving around remote acknowledgment do not flicker or double
  apply,
- disposal unsubscribes and cancels outstanding waits, and
- a deliberate negative control makes the rebase and dedup laws fail.

Showtime keeps domain-law tests for `EntityWrite`, Writer application, merge, and
commit/reload equivalence. Existing tests of queues and version refs should be deleted
as their responsibilities move; layering those old tests under the new interface would
freeze the previous implementation shape.

## Migration plan

### Phase 1 — Contract and in-memory authority

- Create `packages/replica` with the core, server, React, and testing entry points.
- Move the disposable Zero mock's behavior into interface-level tests.
- Implement identity, pending log, projection, delivery, deduplication, and rebase in
  memory.
- Prove the behavior suite and negative controls before application integration.

### Phase 2 — Showtime entity adapter

- Register `entity.write` around the existing `EntityWrite` schema and Writer reducer.
- Add the authority dedup schema and transaction adapter.
- Extend accepted entity snapshots with the per-client watermark.
- Bind current Server Actions and accepted-state delivery behind the transport port.
- Migrate one low-risk entity write family before the whole provider.

### Phase 3 — Replace entity coordination

- Move remaining replayable entity writes onto the replica.
- Classify current `enqueueOnce` callers and encode their preconditions in intent.
- Remove superseded per-class queues, token refs, stale retry, and implementation tests.
- Retain gated lifecycle and destructive UI behavior even when their transport uses the
  replica.

### Phase 4 — Combat binding

- Resolve durable and inline combatants to the correct replica at the existing ownership
  decision point.
- Remove per-PC queue/token machinery where the replica now owns it.
- Keep cross-root commands and redacted views application-specific.

### Phase 5 — Second project and publication decision

- Implement a production-shaped adapter in one other project.
- Compare required changes at the external interface rather than granting access to
  internals.
- Stabilize naming, persistence requirements, and error taxonomy from two real
  consumers.
- Publish only after the second adapter passes the shared behavior suite.

## Rollout and compatibility

Transport and authority contracts must support mixed deployments:

1. deploy dedup persistence and compatible readers,
2. deploy authority handlers that accept mutation envelopes,
3. expose accepted snapshots with watermarks,
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

| Risk                                                                      | Mitigation                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A small `mutate` wrapper hides the old queues without earning true rebase | Do not remove token/reconciliation code until accepted bases and watermarks are live.                          |
| Duplicate delivery returns a different commit result                      | Store the terminal result or use `Remote = void`; never reconstruct it from newer state.                       |
| A snapshot double-applies a committed mutation                            | Require the per-client incorporation watermark.                                                                |
| A stale transport response regresses the base                             | Require each transport adapter to emit accepted snapshots in causal order and test the adapter contract.       |
| Replaying a lifecycle command changes its meaning                         | Encode its observed precondition in the mutation arguments and surface typed conflict.                         |
| Prediction leaks or requires hidden state                                 | Keep redacted surfaces narrower or server-driven.                                                              |
| The package becomes a framework adapter collection                        | Keep the core interface to snapshot, subscribe, mutate, and dispose; keep vendor code in application adapters. |
| One consumer dictates a false generalization                              | Validate the interface with a second production-shaped project before stabilization.                           |
| Publication creates two `Result` types                                    | Preserve `@workspace/result` as the single authority and plan its packaging with replica publication.          |

## Open decisions

These decisions should be made with implementation or second-consumer evidence, not in
the abstract:

1. The external package and npm scope name.
2. Whether the first public version supports a durable identity/pending-log adapter.
3. The default retry budget and which transport failures are retryable.
4. Dedup outcome retention and cleanup policy.
5. Whether conflict history is retained until acknowledged or exposed only as current
   snapshot state.
6. Whether Showtime can move directly to `Remote = void` or needs `EntityCommit` during
   migration.
7. Which other project will provide the second production adapter.

## Acceptance criteria

The proposal is implemented when:

- application call sites express only typed mutation intent;
- the replica owns prediction, ordered delivery, retry, acknowledgment, and rebase;
- the authority records dedup state atomically with domain outcomes;
- accepted snapshots carry incorporation watermarks;
- the shared behavior suite passes against both in-memory and Showtime adapters;
- replayable and preconditioned mutation families have explicit tests;
- old queues and version-token coordination are removed only where the replica fully
  replaces their contracts; and
- a second project validates the external interface before a stable publication.
