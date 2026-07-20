# Technical design assessment

**Reviewed design:** revision 3<br>
**Disposition:** Proceed with the bounded spike; required amendments were
incorporated into [technical design revision 4](./technical-design.md).

## Overall verdict

**Proceed with the bounded spike, but do not yet treat the design as proven.**

My answer to the keystone question is **conditionally yes**: the proposed package is shaped like a genuinely deep module and avoids the architectural mistake in the earlier attempt. The old package exported the hard part of the read problem—causally ordered accepted state, cursors, watermarks, generation control, and recovery—as an adapter responsibility. The result was measured application growth of 390 lines, roughly 270 like-for-like, while each root family acquired hundreds of lines of distribution ceremony. The new design instead accepts a complete authoritative base and exposes only a refresh verb. It places delivery order, mutation identity, ambiguous retry, optimistic lifetime, revision coverage, realtime comparison, refresh coalescing, and stall detection inside the package. That is a categorical improvement, not merely a revised type interface. It remains unproven in four places:

1. Whether separate `useOptimistic` Actions can be held and settled independently through acceptance and incorporation.
2. Whether existing persistence code can move wholly into a package-owned receipt transaction without parallel Store variants.
3. Whether loader revision vectors are derived from data naturally, especially for combat and fog views, rather than maintained as route-level dependency manifests.
4. Whether centralized Ably authorization and polling fallback remain smaller than the synchronization code being deleted.

The appropriate decision is therefore:

> **Go for Phase 0 and Phase 1. Make Phase 2 application contraction—not package functionality—the first adoption gate. Do not proceed to Phase 3 if the character binding still contains old coordination under new calls.**

---

## 0. Does this create a truly deep module?

### Why this proposal is materially better than the old one

The old `Replica` had a small-looking top-level API, but its transport required the application to produce an atomic tuple of domain state, client watermark, and causal cursor. It also required adapters to classify cursor relationships, suppress stale generations, recover incomparable state, and reconnect without gaps. It was shallow because the package and adapter operated at the same abstraction level: both understood accepted-state ordering and recovery. The package hid implementation mechanics, but not the design decisions that made the system difficult.

The new proposal changes the abstraction boundary:

- Application loaders produce complete, versioned projections.
- The package never accepts pushed domain state.
- Realtime carries invalidation only.
- A refresh adapter requests another base but does not return or merge state.
- The package decides the mutation lifecycle from prediction through incorporation and stall.
- The daily client interface is approximately `value`, `mutate`, status, conflicts, and optional retry. It is the right direction in the Parnas/Ousterhout sense: a small interface hides a large, cohesive policy.

### Where depth could still collapse

The package is deep only if the following four boundaries hold in implementation:

| Boundary         | Deep outcome                                          | Shallow failure                                                                          |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Client binding   | Supplies a base, predictor and action; calls `mutate` | Retains queues, refs, retry branches or refresh scheduling around package calls          |
| Server binding   | Supplies a transactional domain handler               | Wraps every Store with bespoke receipt, transaction and stamp adapters                   |
| Loader binding   | Derives axes from rows already used for projection    | Pages maintain hand-written lists of every possible dependent axis                       |
| Realtime binding | Supplies one centralized authorization policy         | Every surface independently calculates channels, reauthorization and attachment recovery |

The proposed design recognizes most of these failure modes explicitly. It states that queue operations, optimistic-log operations, cache-tag construction and refresh generations must not become caller interfaces, and it makes app contraction an acceptance criterion.

### Keystone conclusion

**The interface is capable of being a deep module.** It is substantially deeper than the old design because it eliminates the generic read transport and owns the complete coordination model.

However, “deep” should not be awarded based on the proposed types. It should be awarded when the Phase 2 and Phase 3 deletion ledger is realized. The correct proof is that `apps/web` no longer contains alternate implementations of the same policies.

---

## 1. Does the interface actually delete app knowledge?

The table distinguishes three outcomes:

- **Disappears**: the application should no longer contain this concept on the client.
- **Package-owned**: the package owns the behavior; the app supplies domain facts at a narrow seam.
- **Application glue**: some responsibility necessarily remains because it is product, security, or projection knowledge.

| Responsibility      | Expected outcome                                                         | What may legitimately remain in `apps/web`                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queueing            | **Package-owned entirely**                                               | Domain sequencing such as “place token, then reveal zone” may remain, but it must call ordinary `mutate` operations. No queue refs, lanes or enqueue APIs may survive. |
| Token management    | **Client token management disappears**                                   | Storage version columns and axis factories remain as server/read facts. They must not be forward-only client write credentials.                                        |
| Stale retry         | **Client stale retry disappears; authority retry becomes package-owned** | Mutation-specific preconditions and typed domain conflicts remain application semantics. No version-refetch action or second-stale branch survives.                    |
| Optimistic replay   | **Package-owned**                                                        | The application supplies a pure predictor and domain error type. It must not maintain or replay a pending list.                                                        |
| Receipt identity    | **Package-owned**                                                        | The UI may expose “retry uncertain delivery,” but it must not allocate IDs, canonicalize envelopes, or access receipt storage.                                         |
| Realtime comparison | **Package-owned**                                                        | The application decides who is authorized to observe which axes. It must not compare revisions, deduplicate events, or coalesce refreshes.                             |
| Refresh coalescing  | **Package-owned**                                                        | The application chooses router versus snapshot carrier. It may add genuinely unrelated path invalidation at the Server Action door.                                    |
| Incorporation       | **Package-owned**                                                        | The loader supplies a complete base and revision vector. The application must not decide which pending mutations are now incorporated.                                 |
| Stall detection     | **Package-owned**                                                        | UI copy and presentation of `behind`, `missing-axis`, or refresh failure remain application concerns.                                                                  |

This is largely consistent with the design’s own ownership table. Domain semantics, authorization, projection and lock order remain application-owned; lifecycle coordination does not.

### A responsibility currently missing from the ownership discussion

`guard-write-transition.ts` distinguishes ordinary Server Action/network failure from Next navigation and authorization control-flow throws, using `unstable_rethrow` so redirects, `notFound`, `forbidden`, and `unauthorized` are not swallowed into a generic toast. The design currently says framework control flow remains an application decision. This leaves a likely survivor inside `apps/web/lib/sync`.

The package’s Next client binding should absorb this distinction, or the design should explicitly permit one very small application action-door wrapper outside the synchronization layer. Otherwise the promise to delete `lib/sync` is not quite complete.

---

## 2. Expected deletion ledger

These are planning estimates based on the current code structure, not measured implementation diffs. Package code is excluded; the relevant measure is contraction in `apps/web`.

### Phase 0–1: contract fixture, Drizzle and Ably adapters

No significant application deletion should be expected yet.

Likely additions:

- `packages/predicted/src/react.ts`
- refresh adapters
- Next server/client adapters
- Drizzle receipt authority
- Ably publisher/subscriber
- canonical invocation support
- in-memory adapters and contract suites
- receipt table migration

This phase should not introduce general-purpose app wrappers “in preparation” for migration. Application additions before a binding is cut over would obscure the Phase 2 ledger.

### Phase 2: character binding

#### Likely additions

- One global entity-axis namespace.
- Entity mutation protocol and definitions.
- One application-owned Server Action door.
- Transactional entity handlers.
- A character `VersionedBase` builder colocated with the character loader.
- A thin character prediction provider.
- Registered mutations for name, pronouns, portrait, notes and other identity writes.

The character loader already naturally exposes all four entity versions on the loaded profile, so this is the least contentious base conversion.

#### Files that should be substantially reduced

`apps/web/domain/entity/use-entity-write.tsx` currently owns version refs, one queue per class, stale refetch, realtime comparison, optimistic state, action dispatch, autosave and identity sequencing. Successful Phase 2 should reduce it from roughly 480 lines to approximately **150–220 lines**, with the remainder limited to:

- domain context and typed convenience methods;
- autosave UX such as draft value and flush semantics;
- mapping package lifecycle outcomes to application messages;
- access to the projected entity value.

It must contain no expected-version arguments, version maps, queue construction, token refetch or realtime subscription.

#### Files likely deleted after the character cutover

- `apps/web/lib/sync/character-version-sync.ts`
- character use of `use-monotonic-version-ref.ts`
- character use of `version-token-store.ts`
- entity class-version refetch actions, once no other binding uses them
- character-specific queue/stale/realtime tests

Expected production contraction: **approximately 300–500 lines net**.

A Phase 2 implementation that leaves the existing provider intact and replaces `applyEntityWriteAction` with `predicted.mutate(...)` underneath it has failed.

### Phase 3A: combat binding

#### Likely additions

- Combat mutation definitions sharing the global entity axes.
- A transactional handler that resolves inline versus durable storage from current authoritative locators.
- An encounter base builder that supplies encounter, map-instance and dynamic entity axes.
- A thin combat prediction binding.

#### Files that should be deleted

- `apps/web/components/combat/console/write-lanes.ts`
- `apps/web/components/combat/console/write-lanes.test.tsx`
- `apps/web/components/combat/console/pc-ping.ts`
- per-character channel-list construction and `<RealtimeChannelListener>` rendering
- durable-character stale version refetch machinery
- inline-versus-durable client lane selection

The current combat console explicitly constructs encounter and instance queues, compares pings against their refs, performs microtask refresh coalescing, and delegates durable writes to per-character lanes. The rendered console also mounts one realtime listener per durable PC.

#### Files that should be reduced or deleted

- `use-combat-console.ts`: remove queue, token, realtime and incorporation code.
- `use-combatant-write.ts`: likely delete; at most retain a very small invocation-construction hook.
- `dispatch-event.ts`: either delete or reduce to pure domain event-to-invocation translation.
- expected-version fields in combat action schemas and action calls.

Expected production contraction: **approximately 350–600 lines net**.

### Phase 3B: dungeon and multi-row binding

#### Likely additions

- Dungeon and map-instance axis definitions.
- Registered dungeon and spatial mutations.
- One package-executor handler per atomic command.
- A dungeon complete-base builder.
- Three-axis lifecycle binding after the dual-axis case succeeds.

#### Files that should be deleted

- `apps/web/lib/sync/run-dual-versioned-write.ts`
- every refetch-both stale retry helper
- client-side dungeon/instance nested queue acquisition
- dungeon and instance version-fetch actions used only for stale retry

#### Files that should be substantially reduced

`use-dungeon-console.ts` currently owns two queues, nested dual-row serialization, dual token retry, microtask refresh coalescing and explicit router refreshes. It should fall from roughly 300 lines to approximately **120–180 lines**, retaining domain gestures such as:

- place then conditionally reveal;
- search plus reveal as one named atomic mutation;
- ordinary versus expedition finish selection;
- toast and modal behavior.

Its `dispatch-event.ts` should no longer select a queue or read another queue’s version. Expected production contraction: **approximately 200–400 lines net**.

### Phase 3C: watch-only bindings

#### Files that should be deleted

- `apps/web/lib/sync/use-snapshot-subscription.ts`
- its application-level coordination test suite
- the app-owned `use-realtime-channel.ts` runtime
- version-ping parsing/comparison helpers
- thin watch hooks that exist only to configure the old subscription helper

The current snapshot subscription owns ping routing, two revision refs, refresh aborts, monotonic snapshot application, degraded polling, visibility behavior and realtime availability. Its tests cover exactly those policies. The encounter and dungeon hooks may remain as roughly 10–30 line domain bindings to `createObservedRoot`, or disappear into their components.

Expected production contraction: **approximately 300–500 lines net**.

#### Required watch caveat

The present watch implementation polls when realtime is unavailable. The proposed observe-only root describes invalidation, refresh and stall behavior, but does not clearly specify a continuing polling fallback. To delete `use-snapshot-subscription` without a liveness regression, the package must own a polling invalidation adapter or an equivalent `pollWhenUnavailable` policy. Leaving the polling loop in an application hook would preserve a second read-reconciliation architecture.

### End-of-Phase-3 hard ledger

By the Phase 3 exit, these should be true:

- `apps/web/lib/sync` contains no synchronization runtime.
- Generic JSON-fetch code, if still useful, has moved to an HTTP utility rather than preserving the directory.
- `guard-write-transition` has moved behind the Next adapter or outside the sync architecture.
- `write-lanes.ts` is deleted.
- dual-version client machinery is deleted.
- no action input contains a generic expected revision.
- no component compares a realtime revision.
- no component schedules a synchronization refresh.
- no app test constructs a queue or monotonic token.

A reasonable expected total is approximately **1,100–1,800 lines of net production contraction in `apps/web`**, plus substantial deletion of application coordination tests. The package and its contract suites may be larger; that does not make it shallow so long as callers contract.

---

## 3. Can `useOptimistic` remain the sole pending store?

### Answer

**It can plausibly remain the sole store of pending projected domain state. It cannot be the sole store of all mutation protocol metadata.**

The package will necessarily need a private ledger containing:

- mutation ID;
- canonical envelope;
- delivery state;
- accepted vector or rejection;
- `accepted` and `incorporated` deferreds;
- retry and uncertainty metadata.

That ledger is acceptable because it does not contain a second copy of the projected domain state and does not perform a second optimistic reduction. It should be invisible to callers.

The invariant should be:

> `useOptimistic` is the only mechanism that computes and renders the predicted `State`; the private ledger records lifecycle facts only.

React 19.2 documents the two fundamentals the proposal needs:

- optimistic state remains active while its Action is pending;
- when the base value changes during a pending reducer-form Action, React reruns the reducer over the new base. ([React][2])

That is encouraging, but it is not sufficient proof.

### The key undocumented behavior

The design needs Action A to remain pending after authority acceptance, while its queue slot is released so Action B can be sent. It then needs A to settle when its accepted vector is covered, without settling or dropping B.

React documents that multiple ongoing transitions are currently batched, and `useTransition` pending state remains true until all associated Actions complete. ([React][3])([React][4]) The documentation does not provide a public per-optimistic-update handle or explicitly guarantee the exact independent-settlement behavior required here. The implementation may work, but this is precisely what the Phase 0 fixture must establish.

The most important test is:

1. A predicts.
2. A is accepted but remains uncovered.
3. B predicts and is accepted.
4. A’s vector becomes covered while B’s does not.
5. React must remove A’s optimistic application and rebase B exactly once over the new base.

If A remains applied until B settles, the new base already includes A and the UI will temporarily apply A twice. That falsifies the design.

### Replay refusal is another difficult edge

The `useOptimistic` reducer must remain pure. React explicitly requires that purity. ([React][2])

Therefore the reducer cannot:

- mutate the lifecycle ledger;
- remove a queued envelope;
- resolve receipt promises;
- append an imperative conflict record.

A viable implementation can return an internal pure frame such as `{value, refusedIds}`, expose only `value`, and reconcile `refusedIds` with the private lifecycle ledger after render. Another viable approach may exist, but any solution that performs lifecycle side effects in the reducer is invalid.

### Required React contract tests

The Phase 0 fixture should not pass merely because one optimistic mutation works. It needs all of these scenarios:

| Scenario                                                | Required result                                                |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| A accepted/uncovered; B accepted/uncovered              | Both predictions remain, queue is no longer blocked by A       |
| Base covers A only                                      | A settles; B is replayed exactly once                          |
| A rejects while B is pending                            | A rolls back; B survives over the unchanged base               |
| New external base while A and B pending                 | Predictors rerun in root order over the new base               |
| Multi-axis stamp partly covered                         | Mutation remains predicted                                     |
| Unsent replay refusal                                   | Envelope is cancelled and later valid mutations survive        |
| Sending or uncertain replay refusal                     | Prediction is removed, but delivery continues with the same ID |
| Refresh transition while optimistic Actions remain open | Refresh completion is independently observable                 |
| Root unmount                                            | Every deferred Action and receipt settles without a leak       |

### Fallback-refresh concern

The design correctly proposes a dedicated refresh transition rather than using the transition that holds optimistic Actions open. But transition completion is still an inferred signal, not a returned freshness result. Next’s refresh APIs are void, and React currently batches overlapping transitions. ([Next.js][5])([React][3]) The fixture therefore needs to prove:

- a refresh transition produces a reliable pending-to-settled edge;
- the newest delivered base is visible when coverage is checked;
- an unrelated optimistic Action does not prevent that edge;
- a no-op or cached refresh still leads deterministically to the second attempt and then `stalled`.

### Decision rule

A private lifecycle ledger is compatible with the design.

A second public optimistic log, external domain-state store, or duplicate patch replay engine is not. If the React fixture requires one, the correct outcome is to narrow or abandon the package rather than recreate the old architecture behind a different name.

---

## 4. Can existing Stores run inside the receipt transaction?

### Answer

**The underlying persistence helpers are reasonably well positioned. The existing Store boundaries are not. A meaningful refactor is required, but it can be systematic rather than bespoke.**

### Existing advantages

The repository already has a shared `WriteExecutor` type representing either the database or a transaction. Guarded update helpers and several dungeon and encounter persistence functions already accept it. Dungeon multi-row code also documents an existing total domain lock order and has helpers that operate on a supplied executor. This means the lowest persistence layer does not need a parallel “receipt-aware repository.”

### What must change

#### 1. Loads, authorization and reduction must enter the transaction

Several current actions load and reduce before `guardMany`, then transact only the final guarded updates. For example, `searchRevealAction` loads the dungeon and instance, authorizes and calculates both next values before entering `guardMany`. This is incompatible with whole-handler contention retry. Every attempt must rerun:

- authoritative loads;
- contextual authorization using the trusted actor;
- current-state preconditions;
- domain reduction;
- guarded writes.

Passing `tx` only to the last two update calls is insufficient.

#### 2. Existing Stores combine concerns that must separate

Current Store-style code combines persistence with some mixture of authorization, publication, route invalidation and global database access. These must become:

- a transactional handler using only `{tx, actor, args}`;
- a returned typed outcome and complete revision stamp;
- package-owned post-commit cache/realtime finalization;
- optional application-only invalidation for unrelated projections.

There should not be both `commitEntityWrite` and `commitEntityWriteInTransaction`. The one implementation should accept `executor = db` where standalone reuse is still needed.

#### 3. `guardMany` cannot continue owning the outer transaction

Protocol handlers will already be inside the receipt authority transaction. A helper that starts another transaction is the wrong abstraction.

`guardMany` should be split into:

- transaction ownership, now supplied by the package authority;
- domain composition and rollback classification, reusable inside that transaction.

A nested savepoint may be justified for handler rollback, but a second outer transaction is not.

#### 4. Old expected-version lifecycle locks need semantic revision

`lockDungeonRowForLifecycle` currently takes an expected version and can return `"stale"`. Under the proposed model, it should generally lock and return the current row. Generic client staleness no longer exists. A mutation-specific precondition may reject based on a domain fact, while a lost internal CAS causes the package to retry the attempt.

This is more than injecting an executor.

#### 5. Complete stamps must become enforceable

`endDungeonCombatAction` advances the encounter, map instance and dungeon rows inside one transaction, but its public result returns only encounter and instance versions. This is valid for today’s client token protocol, but invalid for the proposed package. The accepted stamp must include every incremented axis, including the dungeon axis.

Manual object assembly is a likely source of omissions. A small authority-context operation such as `recordStamp(axis, revision)`, or persistence helpers returning a branded stamped revision, would make omissions easier to detect. This need not become a generic repository; table shape and lock order can remain entirely application-owned.

#### 6. Terminal rejection after partial work needs a defined rule

The design says typed rejection is recorded durably, while contention rolls back without a receipt. That requires one of two disciplines:

- every terminal domain rejection occurs before any domain write; post-write failures are classified as contention and retried; or
- the authority runs the handler in a savepoint, rolls back domain effects to that savepoint, then records the terminal rejection in the outer receipt transaction.

This should be part of the Drizzle adapter contract rather than left implicit.

#### 7. Rerunnable handlers need an effect audit

All pre-acceptance effects must occur through the supplied transaction. Publication and cache invalidation already belong after commit in the proposed design. Random ID generation also needs review: when a generated ID is visible to the predictor or later intent, it should normally be part of the stable invocation; authority-only IDs can be regenerated after a rolled-back contention attempt if that does not change user-visible semantics.

### Receipt-first and lock ordering

Making the receipt identity the first lock is coherent as long as every protocol mutation follows:

```text
receipt → dungeon → map instance → encounter → region
```

The receipt layer introduces a common prefix rather than a competing domain order. The design explicitly requires this.

### Store integration conclusion

This is **feasible but medium-to-high refactor cost**.

It passes if the result is one executor-aware Store implementation per domain operation.

It fails if the migration creates:

- `Store` plus `ReceiptStoreAdapter`;
- `commitX` plus `commitXInPredictedTransaction`;
- an action wrapper that reconstructs stamps and post-commit effects;
- loads outside the supplied transaction;
- bespoke receipt ceremony for each Store.

---

## 5. Do global axes simplify loaders?

### Character: low risk

The character route is the best case. Its loaded profile already contains identity, vitals, inventory and progression revisions together. The vector follows naturally from the data. The main requirement is that the value and revisions come from the same row observation.

**Assessment: natural, likely a net simplification.**

### Combat: medium risk

The combat loader already knows:

- encounter version;
- map-instance version;
- durable entity IDs;
- durable vitals versions.

But it obtains the encounter, campaign, instance, participant metadata and short IDs through multiple separate reads. Converting those facts into axes is straightforward. Producing a non-torn base is not.

The design says a consistent read transaction is acceptable, but this must be specified more strongly: PostgreSQL’s default Read Committed isolation gives each statement a new snapshot, so two `SELECT`s inside one ordinary transaction can still observe different committed states. A multi-query base needs one SQL statement, explicit locking, or Repeatable Read isolation. ([postgresql.org][1])

There is also a conceptual distinction the design should sharpen:

- **incorporation axes**: every axis a mutation from this root may stamp;
- **read dependency axes**: every axis whose changes can alter the projected value.

A combat view may display identity or other entity-derived facts that it cannot mutate. Those are still read dependencies and may need invalidation. The base vector should describe observed projection dependencies, not merely writable targets.

**Assessment: manageable if the query layer derives dynamic axes; risky if combat pages assemble them manually.**

### Dungeon console: medium risk

For the basic console, `dungeon/{id}` and `map-instance/{id}` are natural. The difficulty increases for lifecycle gestures involving encounter or region state.

The rule should be:

- every incremented row appears in the accepted stamp;
- every axis a mounted root may receive from one of its mutations is present in its base;
- rows used only as locks need not be stamped unless their revision is incremented.

That is consistent with the proposed design. The existing loader composition will still require consolidation into one consistent observation.

**Assessment: natural for two axes; moderate refactor for lifecycle commands.**

### Fog and watch loaders: high risk

The dungeon fog snapshot currently reads:

- dungeon;
- campaign;
- map instance;
- placed campaign characters;
- current live encounter;
- occupied party vitals.

It then exposes only dungeon and instance versions in the projected metadata. This is exactly where a dependency-manifest problem can emerge. The projected value can change because of more than the two currently exposed counters.

The encounter watch snapshot similarly folds encounter, map-instance and durable vitals revisions into one composite string. The new model improves on the opaque composite by naming axes, but it must first audit whether those three classes completely cover all projected dependencies.

### The absence-dependency problem

Suppose a dungeon currently has no live encounter. There is no `encounter/{id}` axis to observe. Creating a new encounter cannot invalidate an axis whose ID did not previously exist in the base.

The view therefore needs a stable container or membership axis that changes when “the live encounter for this map instance” changes. Possibilities include:

- the dungeon lifecycle axis;
- the map-instance axis;
- a dedicated stable encounter-membership axis.

The same issue applies to roster membership and similar queries over changing sets. Dynamic entity axes cover updates to existing members, but they do not by themselves announce that a member was added or removed.

This should be treated as a first-class axis-design rule:

> Any query over the existence or membership of a dynamic set needs an already-observable container axis.

### Avoiding loader manifests

A successful implementation should not have page components containing code like:

```ts
revisions: {
  [dungeonAxis(...)]: ...,
  [instanceAxis(...)]: ...,
  [entityVitalsAxis(...)]: ...,
}
```

across many routes.

Instead, each authoritative loader should return `{value, revisions}` from its query/projector module. A small collector can derive dynamic entries from the exact rows used:

```text
read row → project value → observe row's axis and revision
```

The loader contract should test:

- value and revision come from the same observation;
- all dynamic rows used by the projector contribute their axes;
- an absence query has a stable container axis;
- every possible accepted stamp from that root is a subset of the base’s observed axes;
- a deliberate omitted axis results in `missing-axis` or a failed contract.

### Axis ceiling

The 128-tag limit is a material sizing issue for combat and party projections. Four axes per character can approach it quickly, even before encounter and instance axes are included. The proposed design is correct to fail closed rather than silently use a partially tagged base.

### Loader conclusion

| Loader     | Verdict                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| Character  | Axes fall out naturally                                                                 |
| Combat DM  | Dynamic axes are natural; consistency and complete dependency coverage require refactor |
| Dungeon DM | Basic axes are natural; lifecycle and region commands need careful expansion            |
| Fog/watch  | High risk of a new dependency manifest and missing absence axes                         |

Global axes simplify loaders **only when vector construction belongs to the query/projector layer**. If route modules maintain the vectors, synchronization knowledge has merely moved from writers into readers.

---

## 6. Is the Ably design cheaper than the code it replaces?

### Current cost

The current token route is approximately 50 lines and has a deliberately simple capability model: a public domain and short ID map to one exact subscribe-only channel, with no authorization database lookup. The current client hook is about 170 lines and owns:

- token acquisition;
- lazy Ably loading;
- connection and reconnect state;
- one channel subscription;
- cleanup;
- availability callbacks.

On top of that, comparison, channel lists, refresh coalescing and polling are distributed through entity, combat and watch bindings.

### Proposed cost distribution

The proposed package would absorb almost all client-side sophistication:

- hashed channel derivation;
- singleton axis parsing;
- revision monotonicity;
- event-level coalescing;
- dynamic subscription changes;
- reauthorization state;
- attach-gap refresh;
- unavailable status;
- cleanup.

That is a genuine client-side application reduction. The cost moves to one application-owned server policy:

- authenticate the viewer where necessary;
- derive the currently authorized axes from trusted state;
- issue exact hashed-channel capabilities;
- handle dynamic combat membership;
- resolve public watch scope without disclosing hidden storage identities.

### Estimated application-owned authorization cost

These estimates exclude package implementation and include production code only:

| Component                                  | Expected size if centralized |
| ------------------------------------------ | ---------------------------: |
| Token/authorization route shell            |                  40–80 lines |
| Shared trusted axis-authorization resolver |                100–200 lines |
| Combat-specific scope policy               |                  30–80 lines |
| Public fog/watch scope policy              |                 50–120 lines |
| Total app-owned production code            |  approximately 180–350 lines |

Tests for authorization, unauthorized-axis rejection, dynamic roster changes and public fog scope could add another 200–400 lines, but those are security policy tests rather than synchronization-runtime duplication.

If each route independently assembles capabilities, the production total could readily exceed 400–600 lines and would recreate the old distribution problem.

### Dynamic combatants

A client must not be able to submit arbitrary entity axes and receive capabilities for them. The token route needs a stable application authorization scope—such as the encounter or dungeon public identity—and must recompute the currently permitted axes from trusted roster and viewer information.

The preferred flow is:

1. Client reports its root scope and requested hashed channels.
2. Server authenticates or applies the public-view policy.
3. Server reloads the current permitted dependency set.
4. Server intersects or verifies the request.
5. Server issues exact subscribe capabilities.
6. Package authorizes before attaching added channels.
7. Package refreshes once after attachment to close the gap.

That is more expensive than today’s “knowledge of short ID grants one channel,” but it is centralized and can cover all dynamic surfaces.

### Watch-only fog views

Public fog is the harder policy. The resolver must derive every permitted dependency axis from the public dungeon scope while preserving redaction. It should not require the client to enumerate raw character or encounter IDs.

This is likely to be the largest application-owned Ably policy, because it overlaps with the loader’s dynamic dependency calculation. That overlap should be factored into one trusted `authorizedObservation` or base-scope service rather than duplicated between loader and token route.

### Missing degraded-mode behavior

The proposed design’s biggest Ably omission is not capabilities; it is polling.

Today’s watch path continues to refresh approximately every 1.5 seconds when realtime is unavailable. The current test suite explicitly verifies that degraded behavior. Merely exposing `invalidations: "unavailable"` leaves a watch mounted indefinitely without further change notifications. To preserve current behavior and still delete the app helper, the package needs something like:

```text
createPollingInvalidations({
  intervalMs,
  pauseWhenHidden,
  stopWhen,
})
```

or a carrier option that polls while realtime is unavailable.

It should own visibility handling, cancellation, coalescing and recovery, rather than asking each watch hook to rebuild them.

### Ably conclusion

- **Client application code:** clearly cheaper.
- **Application authorization code:** more expensive than today.
- **Whole application:** likely cheaper only if authorization is centralized and the package also absorbs degraded polling.
- **Failure condition:** route-specific capability manifests plus retained application polling.

The increased Ably sophistication is justified only because it replaces the entity, combat, dungeon and watch reconciliation implementations together. It would not be justified for one surface in isolation.

---

## 7. Are tests migrating or being duplicated?

The intended migration is sound. The key is distinguishing coordination tests from domain tests.

| Current test area                                                                 | New home                                                          | Application tests that should remain                                 |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `write-queue.test.ts` serialization, stale retry, token bump and spine recovery   | `verifyPredictedRootContract` and authority contract              | At most one binding-level dispatch-order smoke test                  |
| `version-token-store.test.ts` monotonic maps                                      | Package vector/invalidation contracts                             | None                                                                 |
| `use-entity-write.test.tsx` queueing, stale retry, echo suppression, reconnect    | Package React, refresh and invalidation contracts                 | Predictor refusal, error-message mapping, autosave product semantics |
| `write-lanes.test.tsx` per-character queues, durable retry, ping comparison       | Package root/authority contracts                                  | Server storage-home routing and accepted-axis tests                  |
| `use-snapshot-subscription.test.ts` ping routing, abort, monotonic apply, polling | Observe-root, refresh, invalidation and polling-adapter contracts | One watch end-to-end redaction/catch-up story                        |
| dual-version helper tests                                                         | Multi-axis authority and incorporation contracts                  | Domain atomicity and lock-order tests                                |
| realtime hook tests                                                               | Package Ably adapter contract                                     | App capability-policy and token-route tests                          |

The current queue tests are almost entirely generic coordination laws—serialization, retry, monotonicity and recovery after throws—and belong in the package. The current entity provider tests likewise assert one-shot stale retry, per-class serialization, realtime comparison and echo suppression. Those should not be repeated against a thin app provider after migration. The current test explicitly verifies that an in-flight identity write does not block a vitals write. The new design intentionally chooses one queue per mounted root. That test should be deleted and replaced with:

- the package’s root-order contract;
- a measurement of whether uncertain low-value writes cause unacceptable UX blocking.

It should not be retained as an app compatibility requirement.

### Tests that must remain application-owned

These are not evidence of a shallow package:

- predictor/authority isomorphism laws;
- mutation-specific precondition and replay semantics;
- authorization and tenant isolation;
- fog and field redaction;
- domain transition tests;
- guarded persistence and domain lock order;
- loader vector completeness and consistent-observation tests;
- Ably capability-policy tests;
- one character-to-combat cross-view integration story;
- one dungeon multi-axis incorporation story;
- one no-realtime watch story;
- one ambiguous-delivery duplicate-recovery story.

The proposed design correctly preserves predictor/authority laws as application tests rather than pretending the package can prove domain equivalence.

### Duplication rule

An application test should not mock or inspect:

- queue order;
- monotonic version maps;
- stale token refetch;
- refresh generations;
- incorporation bookkeeping;
- axis-event deduplication;
- optimistic-log contents.

A binding may have one end-to-end test showing that package behavior is wired correctly, but the exhaustive behavior matrix belongs only in package contracts.

It is acceptable for total repository test LOC to grow. The relevant criterion is that application tests no longer need to understand synchronization mechanics.

---

## Required design amendments before implementation

I would make five changes to the document before treating Phase 0 as fully specified.

### 1. Define the permitted private ledger

State explicitly that the package may maintain lifecycle metadata keyed by mutation ID, but may not maintain a second projected `State`, patch log or public pending log.

### 2. Add a hard independent-Action contract

Make “A incorporates while B remains pending” the primary React falsification test. Also test the dedicated refresh transition while optimistic Actions remain open.

### 3. Strengthen the loader consistency requirement

Replace “one consistent read transaction” with:

> one SQL statement, appropriate row locking, or a transaction isolation level that guarantees one snapshot across all projection queries.

A default PostgreSQL Read Committed transaction is not enough. ([postgresql.org][1])

Also clarify that base revisions cover all projection dependencies, not only axes the root can mutate.

### 4. Add absence axes and degraded polling

Require stable container axes for dynamic-set existence and membership. Add a package-owned polling invalidation adapter for watch views when Ably is unavailable.

### 5. Specify the transactional handler and rejection contract

Define:

- how existing `guardMany` bodies run inside the authority transaction;
- whether handler work uses a savepoint;
- which failures are contention versus terminal rejection;
- how complete stamps are accumulated;
- how Next control-flow throws are preserved;
- how post-commit effects are separated.

---

## Final assessment

The proposed design has corrected the central error of the earlier attempt. It no longer asks an application adapter to implement a generic accepted-state stream. It makes a strong, opinionated choice: complete authoritative bases in, named intent out, package-owned coordination between them.

That is the right architecture for a deep module.

The remaining risks are implementation-level but existential:

- independent `useOptimistic` settlement;
- transaction-wide Store rerun;
- complete loader dependency axes;
- centralized Ably authorization plus polling fallback.

The spike should proceed, but its success criterion should be deliberately asymmetric:

> Package code may become substantial. `apps/web` must become materially smaller, and the old coordination files must be deleted rather than delegated through.

Phase 2 is the decisive checkpoint. If the migrated character provider still owns queues, refs, stale branches, realtime comparison, refresh scheduling or incorporation logic, the package has failed before combat and dungeon migration begin.

[1]: https://www.postgresql.org/docs/current/transaction-iso.html "PostgreSQL transaction isolation"
[2]: https://react.dev/reference/react/useOptimistic "useOptimistic – React"
[3]: https://react.dev/reference/react/startTransition "https://react.dev/reference/react/startTransition"
[4]: https://react.dev/reference/react/useTransition "https://react.dev/reference/react/useTransition"
[5]: https://nextjs.org/docs/app/api-reference/functions/refresh "https://nextjs.org/docs/app/api-reference/functions/refresh"
