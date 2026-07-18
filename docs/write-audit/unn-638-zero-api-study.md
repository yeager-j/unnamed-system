# UNN-638 — Zero mutation-interface study

Status: executable interface sketch, not an adoption prototype. Studied against
the current [Zero mutator interface](https://zero.rocicorp.dev/docs/mutators) on
2026-07-18.

## Verdict

Do not build the Fly.io/Neon prototype. The adoption blockers in UNN-638 are
already decisive, and a working deployment would mostly measure integration
effort we have no intention of accepting.

The useful spike is local and executable: copy the public shape of Zero's
mutation interface, run Showtime's real `EntityWrite` + Writer through it, and
identify which apparent simplifications come from the interface versus the sync
engine behind it.

The sketch lives in:

- `apps/web/lib/sync/__spikes__/zero-mock.ts` — a disposable in-memory model of
  named mutators, client/server completion, ordered mutation IDs, deduplication,
  and rebase.
- `apps/web/lib/sync/__spikes__/zero-entity-mutators.ts` — the real
  `EntityWrite` and `applyEntityWrite` bound as one Zero-shaped mutator.
- `apps/web/lib/sync/__spikes__/zero-entity-mutators.test.ts` — executable
  examples for optimistic apply, deduplication, rebase, and refusal.

This is deliberately not wired into React or production code.

## What current Zero looks like

Modern Zero defines and registers named mutators, then passes a typed invocation
to `zero.mutate`:

```ts
export const mutators = defineMutators({
  entity: {
    write: defineMutator(entityWriteArgsSchema, async ({ tx, args }) => {
      // Read current state, run the domain transition, write the accepted state.
    }),
  },
})

const mutation = zero.mutate(mutators.entity.write({ entityId, write }))

await mutation.client
await mutation.server
```

`mutation.client` means the optimistic local transaction completed.
`mutation.server` means the server acknowledged the mutation; it does not mean
the authoritative row has replicated back to the client yet. Successful
mutators do not return application data.

The older generated CRUD surface (`zero.mutate.entity.update(...)`) is
[deprecated](https://zero.rocicorp.dev/docs/deprecated/crud-mutators) and is not
a steal candidate.

## Architecture comparison

| Decision           | Showtime today                                                  | Zero                                                                | Consequence for UNN-639                                                  |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Command vocabulary | `EntityWrite` + `ENTITY_WRITERS`                                | Named mutator registry                                              | Keep `EntityWrite`; register it once as `entity.write`.                  |
| Optimistic state   | React `useOptimistic` frame                                     | Local database plus pending mutation log                            | A transport-only extraction cannot honestly claim rebase.                |
| Ordering           | Per-class promise spines                                        | Per-client monotonic mutation sequence                              | Mutation sequence can live inside the extracted module.                  |
| Concurrency        | Version CAS, refetch, one stale retry                           | Publish a new base, replay pending mutators                         | Deleting version tokens requires owning the base and replay.             |
| Duplicate delivery | No general server dedup                                         | Client group + client + mutation ID tracked transactionally         | Steal this independently of Zero adoption.                               |
| Completion         | One `Result<EntityCommit, Error>`                               | Separate `.client` and `.server`, no success value                  | Steal the split, retain Showtime's typed commit payload.                 |
| Authorization      | Trusted Server Action session; policy derived from Writer class | Trusted server context; server mutator may override client behavior | Keep authorization at the Store; never accept context from mutator args. |
| Reconciliation     | Ably invalidation plus `router.refresh()`                       | Database replication updates the local replica                      | Keep adapters until a real accepted-snapshot feed replaces them.         |

Zero's implementation makes the mutation sequence durable in its server-side
client tracking tables and checks it in the database transaction that runs the
mutator. The relevant current source is
[`process-mutations.ts`](https://github.com/rocicorp/mono/blob/main/packages/zero-server/src/process-mutations.ts).

## What the sketch taught us

### 1. The registry is worth stealing

`EntityWrite` is already the right mutator argument and `ENTITY_WRITERS` is
already the right shared client/server transition registry. A single
`entity.write` mutator is enough; generating one transport method per Writer arm
would duplicate the domain vocabulary.

The call site is materially better because it names only intent:

```ts
const mutation = sync.mutate(entityMutators.entity.write({ entityId, write }))
```

No `VersionClass`, queue choice, expected version, retry, or mutation ID belongs
at that call site.

### 2. Mutation identity belongs to the transport envelope

Zero does not ask application callers to mint an idempotency key. The client
runtime assigns a monotonic mutation ID and sends it with a stable client ID and
the registered mutator name. The server advances the last mutation ID in the
same transaction as the domain write:

```ts
type MutationEnvelope<Args> = {
  clientGroupID: string
  clientID: string
  id: number
  name: string
  args: Args
}
```

For `packages/sync`, the useful invariant is the ordered identity
`(clientGroupID, clientID, mutationID)`, not a UUID added to every
`EntityWrite`. The mock fixes one client group and therefore keeps that part
implicit. Dedup state must commit atomically with the accepted write. A
redelivery below the stored last ID is already processed; a gap above the next
ID is an ordering error.

### 3. Rebase—not naming—is what deletes stale-token machinery

The nice call site is honest only because Zero owns all of these together:

1. an authoritative local base,
2. an ordered pending-mutation log,
3. an authoritative update stream, and
4. deterministic replay of pending mutators over each new base.

The test's multi-writer case starts with an optimistic `damage(2)`, receives an
external authoritative `damage(3)`, and replays the pending Writer to display
`damage(5)` before the original mutation reaches the server.

`packages/sync` cannot delete version tokens, Ably reconciliation, or
`router.refresh()` merely by exposing `mutate(...)`. It would need to own a
replica-like state machine and be fed authoritative snapshots. If UNN-639 stays
an extraction of today's transport, keep the token protocol visible inside the
module and do not claim Zero-like rebase semantics.

### 4. Split completion is useful, but Zero's exact result is too small

The `.client` / `.server` split cleanly distinguishes prediction from
acknowledgment and is worth borrowing. Zero intentionally returns no success
payload, while Showtime currently uses `EntityCommit` for version accounting,
revalidation, and `onSuccess` behavior.

A Showtime interface should preserve that information:

```ts
interface MutationHandle<TCommit, TError> {
  client: Promise<Result<void, TError>>
  server: Promise<Result<TCommit, TError>>
}
```

This is Zero-shaped, not Zero-copied.

### 5. Writer refusals need one adapter

Zero rolls back a mutator that throws. Showtime Writers return typed `Result`
refusals. The shared mutator should adapt `Result.err` to the transport's
application-error channel once; widgets should continue to see the typed
refusal rather than parse thrown messages.

### 6. Exactly-once does not automatically delete `enqueueOnce`

Mutation IDs make delivery retries safe. They do not make every mutation safe to
re-execute against newer state.

`enqueueOnce` currently marks lifecycle operations that must surface stale state
instead of silently applying their intent to a newer semantic base. A dedup key
prevents the same accepted mutation from committing twice; it does not decide
whether a not-yet-accepted mutation may be replayed after the base changes.

Delete `enqueueOnce` only after each caller is classified as either:

- a replayable intent whose Writer is valid against any newer base, or
- a preconditioned command whose observed base is part of its meaning.

The second species still needs a precondition, even in a mutation-ID protocol.

## Recommendation for UNN-639

Keep the extraction, but change its center of gravity from hooks and queues to a
small mutation protocol:

```ts
interface SyncClient<Invocation, Commit, Error> {
  mutate(invocation: Invocation): MutationHandle<Commit, Error>
}
```

The module should own mutation naming, client identity, ordered IDs, serialized
delivery, retry, dedup semantics, and split completion. An app-owned persistence
adapter must store the dedup record atomically with the domain commit. Domain
bindings should own descriptors, Writers, refusal types, durable classes, and
reconciliation.

Before implementation, choose one of two honest scopes:

1. **Transport extraction:** preserve current per-class versions and
   reconciliation, but hide them behind `mutate`. This is the narrow UNN-639.
2. **Replica module:** add an authoritative base + pending log + replay and feed
   it accepted snapshots. This earns true rebase and can potentially delete the
   queue/version machinery, but it is a larger product decision.

Start with transport extraction. Design the envelope so a later replica module
can reuse it, but do not prebuild the replica without a second real consumer.

## Steal-back list

- Steal: named, typed mutator registry.
- Steal: `mutate(invocation)` as the small caller interface.
- Steal: client-generated `(clientGroupID, clientID, mutationID)` below the
  domain descriptor.
- Steal: transactional server deduplication and gap detection.
- Steal: separate client and server completion.
- Adapt: preserve typed `Result` refusals and `EntityCommit` success data.
- Defer: replay/rebase until `packages/sync` owns an authoritative base and
  receives accepted snapshots.
- Keep for now: per-class version facts, the reconciliation adapters, and
  `enqueueOnce`'s semantic-precondition behavior.
