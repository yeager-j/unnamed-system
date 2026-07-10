# `lib/entity/commit` — the neutral write vocabulary

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
it natively — the rest trio and the leveling ops return whole components, so
a Writer arm is check → transition → return, never a per-field spread.
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
- **App-owned columns** (name, portrait, pronouns, notes, builderStep, status,
  campaignId) stay classic per-field Server Actions composing
  `bumpEntityVersionGuarded` with their declared class.

Both are the same D35 storage projection surfacing at the write layer; do not
route one through the other.

## Adding a write family

One arm in `entityWriteSchema` + one `WriterMap` entry (its `durableClass` is
the auth + concurrency fact, CH4) + a case in the `applyEntityWrite` reducer
switch. The encounter wire admits only `combatEntityWriteSchema` — extend it
ONLY for state a combat surface genuinely writes; the rejection test pins the
subset. A multi-component patch (rest, levelUp) must keep its columns inside
one version class — CH15's disjoint-footprint guarantee is per class.

## The two optimistic hooks (Open Q5 — container split stays, policy split ended)

`useEntityWrite` (character routes) and `useCombatantWrite` (encounters) both
predict via the same Writers but reconcile differently: the entity door
re-folds `resolveEntity` client-side and catches up via route revalidation;
the console pushes the patch into its session-frame reducer and reconciles via
the pc-ping refetch. That **container** split stays deliberate (the reconcile
channels genuinely differ); converge only if one channel wins.

The **stale-policy** split ended with UNN-567/568: both doors now run the same
`hooks/write-queue.ts` protocol core — serialized per-token spine + one-shot
stale-retry through `getEntityClassVersionAction` — so a cross-writer stale on
the one genuinely multi-writer row (player on sheet + DM on console) self-heals
from either side. A stale that survives the retry is a real conflict: the
entity door toasts + `router.refresh()`; the console toasts and lets the
optimistic frame revert. The debounced auto-save species runs the exported
single-pass `runVersionedWrite` (never `enqueue` — it is already chained on
the class spine; enqueueing from inside a chained step would wait on itself).
