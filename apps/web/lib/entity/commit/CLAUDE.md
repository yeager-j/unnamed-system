# `lib/entity/commit` — the neutral write vocabulary

The client+server half of the one durable write pipeline (ADR §2.4; UNN-551):
`write.schema.ts` is the serializable **descriptor** every component write
travels as (no storage field, no version class on the wire), `writers.ts` the
**Writer registry** (`ENTITY_WRITERS`) whose pure `applyOp` is both the
optimistic predictor and the server's validation pre-mint, and
`merge-patch.ts` the frame merge. The server-only Store + guarded commit live
in `lib/actions/entity/`; combat's encounter door forwards its durable arm to
the same composition.

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

## The two optimistic hooks (Open Q5 — deliberate, revisit at convergence)

`useEntityWrite` (character routes) and `useCombatantWrite` (encounters) both
predict via the same Writers but reconcile differently: the entity door
re-folds `resolveEntity` client-side and catches up via route revalidation;
the console pushes the patch into its session-frame reducer and reconciles via
the pc-ping refetch. They stayed separate at S2a because the reconcile
channels genuinely differ (router.refresh vs Ably ping); converge only if one
channel wins.
