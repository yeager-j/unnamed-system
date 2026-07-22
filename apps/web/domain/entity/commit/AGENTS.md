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
  `entityWriteSchema` descriptor + `ENTITY_WRITERS`: server reads the row, applies
  the pure op, merges — per-field discipline is structural (UNN-226
  unrepresentable).
- **App-owned identity columns** (name, portrait, pronouns, notes) ride the
  `identityWriteSchema` descriptor + `identityWritePatch` (`identity.ts`). No
  Writer, no `durableClass` to derive — they are the `identity` class by
  construction — but the same per-field discipline: one field per invocation, the
  patch composed server-side.

Both are the same D35 storage projection surfacing at the write layer; do not
route one through the other. **They do, however, share one write _protocol_**
(Headcanon P2c — UNN-675): `entity.write` and `entity.identity` are both
registered mutations on `entityProtocol`, so both take a receipt, stamp the axis
they advance, and get its cache-tag expiry and realtime invalidation from the one
executor. Two descriptors, one protocol.

The remaining app columns are **not** on it, and the reason is mechanical: PC
lifecycle state (`builderStep`, `status`, `campaignId`) lives on the unversioned
`playerCharacter` subtype, so it advances no modeled version column and has no
axis to stamp. Those stay plain owner-gated actions (`entity/builder-step.ts`).

## Adding a write family

One arm in `entityWriteSchema` + one `WriterMap` entry (its `durableClass` is
the auth + concurrency fact, CH4) + a case in the `applyEntityWrite` reducer
switch. The encounter wire admits only `combatEntityWriteSchema` — extend it
ONLY for state a combat surface genuinely writes; the rejection test pins the
subset. A multi-component patch (rest, levelUp) must keep its columns inside
one version class — CH15's disjoint-footprint guarantee is per class.

An **identity column** is smaller: one arm in `identityWriteSchema` + one case in
`identityWritePatch`. Keep bounds in the schema and canonicalization in the patch
— the schema must re-admit its own output, because the client sends the args it
built and the authority parses them again, and both sides run the patch so the
prediction and the stored column agree by construction.

## The two optimistic hooks (Open Q5 — container split stays)

`useEntityWrite` (character routes) and `useCombatantWrite` (encounters) both
predict via the same Writers and both bind registered Headcanon mutations. The
character root re-folds `resolveEntity`; the combat root predicts against the
encounter container and then feeds that value into the legacy encounter-event
reducer. Both catch up through opaque canon-axis invalidations. That
**container** split stays deliberate because the two roots own different
values, while character and combat writes to the same durable entity share the
same four entity axes.
