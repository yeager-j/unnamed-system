# 2026-07-08 — The same rulebook rule, executable in two places

**Symptom:** while tracing where a game rule was enforced, the same predicate
turned up written twice — once in the engine, once inline at the write door —
already drifted in signature shape, with no way to say which was canonical.

**Context:** post-v2 architecture health check, Finding 1. The rulebook 1.2
allocation cap exists as `wouldExceedAllocationCap`
(`packages/game-v2/src/virtues/virtue-allocation.ts`) *and* as an inline
`twos > 1 || ones > 2` in the `virtues.setAllocation` Writer
(`apps/web/lib/entity/commit/writers.ts`). Worse, some rules (the inheritance
gate, the rank-spend economy) exist *only* at the app write door — so the
engine cannot defend its own authored-state invariants, and every other
producer of entity bags (seed, future NPC minting) silently bypasses them.

**Principle:** "where does a game rule live" is a distinction that must be
decided once, and the answer is the layer that owns the data's invariants —
the engine (→ Code Style #9; Design by Contract: invariants live with the
class, preconditions at the boundary). Writers are adapters, not rulebooks.

**Action:** UNN-595 (push rule-bearing Writer bodies into game-v2
transitions); UNN-598's isomorphism property then guards the seam.
