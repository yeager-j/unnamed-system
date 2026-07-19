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

## The two Replica-rendered hooks (Open Q5 resolved by UNN-653)

`useEntityWrite` (character routes) and `useCombatantWrite` (encounters) both
delegate prediction, accepted-state reconciliation, rollback, and rebase to a
Replica. Their composition shapes remain application-specific: the entity
binding re-folds one owner root through `resolveEntity`; combat joins one
inline collection plus a dynamic set of durable roots onto the event-owned
encounter frame. The four combat-writable component keys come only from ready
Replica projections, while roster, turns, overlays, and spatial state stay in
the classic frame.

The former console `write` reducer arm and independent Writer precheck are
gone. `useCombatantWrite` now resolves a handle, calls `mutate`, maps receipt
errors, and temporarily folds the inline `{ version }` result into the classic
encounter queue. The join is deliberately Showtime-specific; the generic
package does not coordinate or normalize a managed replica set.
