# `domain/entity/commit` — the neutral write vocabulary

The client+server half of the one durable write pipeline (ADR §2.4; UNN-551):
`write.schema.ts` is the serializable **descriptor** every component write
travels as (no storage field, no version class on the wire), `writers.ts` the
**Writer registry** (`ENTITY_WRITERS`) whose pure `applyOp` is both the
optimistic predictor and the server's validation pre-mint, and
`merge-patch.ts` the patch algebra (the frame merge + `combinePatches`). The
server-only Store + guarded commit live in `lib/actions/entity/`; combat's
encounter door forwards its durable arm to the same composition.

## The patch contract — one vocabulary

There is exactly one patch shape end to end (UNN-601): **whole updated
components**, keys 1:1 with `entity` columns (CH15), an explicit-`undefined`
key meaning "delete the component" (NULL ⇔ absent). Engine transitions speak
it natively — the rest trio, the leveling ops, and the archetype roster
transitions (Origin minting / inheritance-slot / rank-spend — UNN-595) return
whole components, so a Writer arm is check → transition → return, never a
per-field spread. Every rule-bearing arm's game rules live in a `game-v2`
domain transition (the `applyLevelUp` shape), so the engine — not the app door
— owns its authored-state invariants; the Writer keeps only the capability
check and its app-tier composition (e.g. the Virtue Spark-log carry).
`combinePatches` composes two patches; its laws — **identity**,
**associativity**, and **merge-compatibility**
(`merge(merge(e,a),b) = merge(e, combine(a,b))`, including the delete/re-set
edge) — live in `__laws__/patch-monoid.laws.test.ts`. Never hand-compose
patches with conditional spreads (`...(p.vitals && { … })`): that drops an
explicit-`undefined` deletion, the exact edge the negative control proves.

## Two write species — explained once

- **Engine-component state** (vitals, rest, level, narrative, …) rides the
  descriptor router here: server reads the row, applies the pure op, merges —
  per-field discipline is structural (UNN-226 unrepresentable).
- **App-owned columns** (name, portrait, pronouns, notes) use the owner entity
  replica's `entity.setColumn` desired-value mutation. Builder step is an
  unversioned subtype LWW action; finalize and Blob upload are single-attempt,
  identity-preconditioned lifecycle actions.

Both are the same D35 storage projection surfacing at the write layer; do not
route one through the other.

## Adding a write family

One arm in `entityWriteSchema` + one `WriterMap` entry (its `durableClass` is
the auth + concurrency fact, CH4) + a case in the `applyEntityWrite` reducer
switch. The encounter wire admits only `combatEntityWriteSchema` — extend it
ONLY for state a combat surface genuinely writes; the rejection test pins the
subset. A multi-component patch (rest, levelUp) must keep its columns inside
one version class — CH15's disjoint-footprint guarantee is per class.

## The two optimistic hooks (Open Q5 — container split stays, now priced)

`useEntityWrite` (character routes) and `useCombatantWrite` (encounters) both
predict via the same Writers but reconcile differently: the entity replica
re-folds `resolveEntity` client-side and catches up through accepted snapshots;
the console pushes the patch into its session-frame reducer and reconciles via
the push response's revalidated RSC payload plus the replica's watermark rule.
That **container** split stays deliberate (the reconcile channels genuinely
differ); converge only if one channel wins.

Both doors now coordinate through the predicted replica (entity in UNN-645,
combat in UNN-646): ordered delivery, rebase, and typed conflicts replaced the
token/queue stale policy on each. **Priced Open-Q5 evidence from the combat
binding**: with the console container un-converged, every combat write is
predicted twice — once by `reduceConsoleOptimistic`'s `write` arm against the
frame, once by the replica's `apply` against its base — by the same pure
`applyEntityWrite`, and the dispatch transition must be held until `remote`
settles so the prediction outlives the un-fed container. That duplication is
the standing cost of deferral; converging would delete it, at the price of
re-plumbing the console's frame onto replica snapshots.
