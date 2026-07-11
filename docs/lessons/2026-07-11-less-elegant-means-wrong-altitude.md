# 2026-07-11 — A local cleanup that came out less elegant

**Symptom:** mid-improvement — a locally-rational tidy (remove a "redundant"
guard, drop a branch, DRY a check) — and the result feels *less elegant* than
the mess it replaced, even though it improves the metric you were chasing. The
discomfort arrives before you can articulate the objection.

**Context:** UNN-565 (PR #330). The engine ops were made self-guarding, which
left `rest.ts` validating `rolled` at its top *and* the op re-validating it — a
textbook "validate, don't parse" redundancy. The tempting cheap fix: delete
rest's check, let the op be the sole parser. It type-checked and removed a
double-check, but felt worse. Stepping back: rest's guard is a symmetric "here
are my preconditions" statement, and trimming it left an asymmetric,
flow-dependent rule (`skillDiceToSpend` checked here, `rolled` checked three
lines down inside a helper) — and it broke the *uniform defense-in-depth at
every boundary* invariant the engine/Zod-wire seam already established.

**Position:** the rejected trim — dropping `|| !isNonNegativeInteger(rolled)`
from `applyPartialRest`'s guard to save one re-check. It optimized "fewer
guards" while breaking boundary uniformity. Left as-is.

**Principle:** elegance is a felt proxy for **conceptual integrity** (Brooks,
*The Mythical Man-Month*) — a change that improves a metric while lowering
elegance is usually trading integrity for the metric, i.e. optimizing at the
wrong altitude. When the local fix feels less elegant, the invariant it
violates is the thing to find. This one **stays at the vibe rung** of Code
Style #8's ladder by nature: it's a meta-heuristic about *when to distrust
local reasoning*, not a contract a type or gate can check.

**Action:** kept the redundant guard (uniform two-boundary defense-in-depth);
noted the only *elegant* dedup would be a branded `NonNegativeInteger` carrying
the proof in the type, which is disproportionate here.
