# @workspace/replica

A predicted-replica runtime for optimistic single-root state. The core owns mutation
identity, ordered delivery, retry, deduplication semantics, accepted-state rebase, and
conflicts. Application bindings own domain intent, authorization, persistence, cursor
comparison, transport vendors, and user-facing policy.

## Managed lifecycle

React and imperative applications should normally create a controller with
`createManagedReplica`. Its bootstrap function receives an `AbortSignal` and returns a
typed `Result`:

```ts
bootstrap: async (signal) => {
  const loaded = await loadAccepted({ signal })
  if (!loaded.ok) {
    return err({ kind: "unavailable", reason: loaded.error })
  }
  return ok({ identity, initial: loaded.value, transport })
}
```

The package classifies thrown calls and ten-second attempt timeouts as retryable. It
makes one initial attempt plus five retries, with exponential delays from 250ms through
4s. Retry exhaustion becomes typed terminal managed unavailability; applications do
not schedule lifecycle retries themselves.

`ManagedReplica.getSnapshot()` is a referentially stable discriminated state:

- `bootstrapping` — the initial attempt is in flight; mutations buffer in order.
- `retrying` — a retryable attempt failed and the package owns the next attempt.
- `ready` — contains the current core `ReplicaSnapshot`.
- `expired` — the identity died and a fresh-identity bootstrap is in flight.
- `unavailable` — terminal refusal or retry exhaustion; no Replica will be created.
- `disposing` — the one-macrotask same-commit flush grace.
- `disposed` — terminal teardown.

Managed receipts intentionally omit mutation identity. A pre-bootstrap invocation has
no synchronous protocol ID, and no managed caller needs one; `local` and `remote`
describe its complete fate. `settleMutations()` is a call-time barrier over invocations
accepted before the call. Later mutations belong to the next barrier and cannot starve
the current one.

Disposal keeps an already-ready Replica alive for one macrotask so child cleanup saves
can flush. A bootstrap may flush its buffer only if it succeeds within that grace. At
grace expiry the attempt is aborted, buffered receipts settle `disposed`, and every late
completion is ignored before a Replica is constructed or its transport is connected.

`onEvent`, `onAccepted`, `onExpired`, and `onUnavailable` are isolated application
callbacks. State transitions and receipt settlement complete before they run; throwing
metrics, logging, routing, refresh, or toast code cannot strand the controller.

`useManagedReplica` exposes the same state machine through React's external-store
contract. Disabled/read-only mounts are `disposed` and never bootstrap.

## Verification

Bindings mount both public contract suites. Managed lifecycle examples, a fast-check
reference model, and jsdom React lifecycle tests live in this package. Reproduce or
deepen generated runs with:

```bash
FC_SEED=1234567890 npm run test --workspace @workspace/replica
FC_NUM_RUNS=1000 npm run test --workspace @workspace/replica
```
