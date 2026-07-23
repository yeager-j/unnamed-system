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

## Generic entity writes

Engine-component state (vitals, rest, level, narrative, …) rides the
`entityWriteSchema` descriptor + `ENTITY_WRITERS`: an authority reads its
container, applies the pure op, and merges the resulting patch. This folder
does not define a root. Character and combat protocols each compose this
vocabulary into the aggregate and ordering domain they actually own.

App-owned character identity columns and finalization are not generic entity
transactions. They live in `domain/character/commit`.

## Adding a write family

One arm in `entityWriteSchema` + one `WriterMap` entry (its `durableClass` is
the auth + concurrency fact, CH4) + a case in the `applyEntityWrite` reducer
switch. The encounter wire admits only `combatEntityWriteSchema` — extend it
ONLY for state a combat surface genuinely writes; the rejection test pins the
subset. A multi-component patch (rest, levelUp) must keep its columns inside
one version class — CH15's disjoint-footprint guarantee is per class.

## The two optimistic roots (Open Q5 — container split stays)

`CharacterRoot` and the combat root both predict via the same Writers and bind
different registered Headcanon mutations. The character root re-folds
`resolveEntity`; the combat root predicts against the encounter container and
then feeds that value into the encounter-event reducer. Both catch up through
opaque canon-axis invalidations. That
**container** split stays deliberate because the two roots own different
values, while character and combat writes to the same durable entity share the
same four entity axes.
