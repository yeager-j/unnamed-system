# 2026-07-21 — The held-open Action was blocking its own release condition

**Symptom:** an optimistic Action was deliberately held open until an external
confirmation arrived — and the confirmation could never arrive, because it
travels the same scheduling lane the held Action blocks. Observed as a root
stuck at `freshness=refreshing, pending=1` forever, correct after any hard
reload; also as clicks on `<Link>` doing nothing while a save was pending.

**Context:** UNN-682 (blocking UNN-676 / PR #414). Headcanon held each
mutation's Action open until canon covered its accepted stamp. React 19
entangles ALL transition-lane work — a Server Action's revalidated RSC
payload, `router.refresh()`, navigations — with every pending Action and
commits none of it until all settle. Where the send is dispatched from is
irrelevant; the payload parks either way. Cost: a full day, the P2d cutover
blocked, and the deadlock passed the whole jsdom contract suite (a test
harness that delivers canon by `rerender` cannot express Action scheduling).

**Position:** `startTransition(async () => { addOptimistic(u); await
coveredByCanon })` where `coveredByCanon` resolves from an effect observing a
prop the router must commit — a commit this Action's pendingness blocks.
Fix: settle at the terminal *acceptance* (`await acceptedOrTerminal`); the
parked covering canon then commits atomically with the settlement, so the
prediction hands off with no flicker frame.

**Principle:** an Action's lifetime must span only actively progressing,
bounded work; a wait whose completion needs a React commit (or is unbounded,
like a manual-retry pause) must not be awaited inside any transition — that
is a self-deadlock, and it freezes navigation globally as collateral. Kin to
[[2026-07-20-shared-pending-is-not-operation-completion]] (entanglement makes
pending non-local — this is the write-side dual) and Code Style #10: home the
"prediction survives until coverage" fact on the reducer's lifecycle facts,
not on a transition's lifetime. Platform physics a jsdom suite cannot see
need a real-runtime negative control before they may be relied on.

**Action:** UNN-682 — settlement moved to acceptance; per-ID idempotent
replay + paused-set reduce in the reducer; `apps/headcanon-fixture` minted
(real-router canonization stories + `/probe` React-physics suite) and wired
into the `e2e` workflow.
