# @workspace/replica — binding-author notes

The design doc is `docs/write-audit/unn-638-replica-module-design.md` (repo root). This file
is the working reference for writing a **binding** — the app-side adapter that gives one
replica root its mutations, transport, authority doors, and tests. The entity binding
(`apps/web/domain/entity/replica/`) and combat binding (`apps/web/domain/combat/replica/`)
are the production examples; `src/reference/` is the deliberately alien one.

## What the package hands you

- `createReplica` — the runtime. You almost never call it directly in React code:
  `createManagedReplica` (framework-free) owns bootstrap-before-construction, ordered
  buffering during the bootstrap window, receipt settlement tracking, expiry rebuild under
  a fresh identity, and one-macrotask deferred disposal; `useManagedReplica`
  (`@workspace/replica/react`) wraps it for a single-replica mount. Imperative callers (a
  keyed set of replicas) drive controllers directly.
- `createPullTransport` (`@workspace/replica/transport`) — the pull-on-invalidation
  transport: pull-generation gate + causal-acceptance gate + subscribe-before-catch-up +
  push-throw→`retryable`, over your `{fetchAccepted, pushEnvelope, subscribe}` source seam.
  Supply `classify` for your cursor (`classifyScalarCursor` covers monotonic counters;
  version vectors write a product-order compare that returns `unknown` on mixed dimensions).
- `createMutationProcessor` (`@workspace/replica/server`) — the authority algorithm. You
  supply `transact`, a dedup adapter (row-locked acquire/record), and `execute`.

Binding-owned, never package-owned: identity naming, cursor construction, auth policy,
toast/error UX, source construction (vendor clients, backoff), and the durable-vs-inline
style root decision an app makes before it ever calls `mutate`.

## Mounting the contract suites

Every binding runs BOTH suites; every production adapter runs the transport suite with
**zero omissions** and asserts the law list **by name**, not by count:

```ts
const laws = verifyTransportContract({ create: createScenario })
it("covers the full law set with no omissions", () => {
  expect(laws.map((law) => law.name)).toEqual([...TRANSPORT_CONTRACT_LAW_NAMES])
})
for (const law of laws) it(law.name, () => law.run())
```

Same shape for `verifyReplicaContract` against `REPLICA_CONTRACT_LAW_NAMES`. The named-list
assertion exists because one capability can gate more than one law — count arithmetic once
hid exactly that bug. `TransportContractOptions.omit` drops a law VISIBLY for a scenario
that genuinely cannot model a capability (the omission must be argued in the test, and
production adapters omit nothing). Non-void `Remote` bindings pass
`remoteMode: "recorded"` and supply `fixtures.expectedRemote` so the recorded-outcome law
(`REPLICA_CONTRACT_RECORDED_LAW_NAME`) mounts.

Passing only the replica contract over the in-memory transport is insufficient: the real
doors must also pass the transport contract (see the `real-door-transport.db.test.ts`
pattern in the entity binding).

## Fixture requirements (`ReplicaContractFixtures`)

These are non-negotiable — the wrong fixture passes laws vacuously:

- `writes` must be **order-sensitive and non-idempotent** (damage/heal, add-currency). The
  flicker/double-apply laws compute "what applying twice would look like"; an idempotent
  write (`setLevel`) cannot fail them.
- `refused` must fail the local `apply` against the initial state (never enters the log).
- `external` must be committable by an out-of-band writer (`controls.commitExternal`).
- `conflicting` is a preconditioned pending/external pair: `pending` valid against the
  initial state, refused on replay once `external` is incorporated.
- `vetoError` is the authority's terminal rejection payload for the veto laws.

## Test worlds

`wrapAuthoritySource` (from `@workspace/replica/testing`) wraps `createInMemoryAuthority`
behind the pull-source seam with the controls both suites drive: gateable reads,
sever/restore, `doctorNext` (incomparable racing observations), observation/read logs, and
the invalidation signal. Your world keeps only what is genuinely its own: cursor
construction (`accepted`) and push-side cursor tracking (`push`). The in-memory authority
runs deliveries through the REAL `createMutationProcessor`, so dedup/ordering in tests is
the production code path.

## Semantics that trip binding authors

- **An error's classification is a claim about authority state.** Only the recording layer
  may say `rejected`; every throw from a push door — including Next navigation sentinels —
  maps to `retryable`, or the watermark advances past an unrecorded ID and wedges the
  stream.
- **Refused mutations consume no mutation ID** (delivered sequences stay gapless).
- **`alive()` is level-triggered** — call it after every successful round-trip, even ones
  that emitted nothing; a parked replica needs exactly that signal to resume.
- **The bootstrap read registers the client.** An absent dedup row means `unknown-client`,
  which expires the identity terminally; recovery is a fresh identity, and dispatches from
  the dead identity's window are refused `expired`, never silently re-issued.
