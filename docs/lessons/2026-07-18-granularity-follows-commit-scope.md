# 2026-07-18 — Replica granularity sized by the UI instead of the authority

**Symptom:** choosing how many replicas (or stores, or caches) a surface gets
by mirroring the surface's own shape — one per roster row, one per console —
felt natural, and every candidate then raised unanswerable follow-ups: what
is THIS one's cursor? who authorizes it? when does it die? The questions had
no home because the unit didn't match anything the authority commits.

**Context:** UNN-646, the combat replica binding (design doc Open decision 7,
deliberately left for implementation evidence). The console dispatches
per-participant, which suggested per-participant replicas across both homes;
per-entity durable + one collection-valued inline replica per encounter fell
out the moment the question changed.

**Position:** durable PC → own row lock, own auth answer, own class-vector
cursor, own lifetime ⇒ one replica per entity row; inline enemies → one row,
one scalar version, one DM gate, one lifetime ⇒ one replica per encounter.
Fan-in stays a transport concern (one Ably subscription, N transports).

**Principle:** replicated-state granularity follows the **authority's commit
scope** — the row-lock + auth boundary — never the UI's dispatch scope; the
handle layer re-maps dispatch addressing onto commit units. (Kin to DDD's
aggregate-as-consistency-boundary, Evans; → Code Style #10 — home state on
the object whose lifetime matches it.)

**Action:** recorded as the resolution of design Open decision 7
(`docs/write-audit/unn-638-replica-module-design.md`) and in
`apps/web/domain/combat/replica/AGENTS.md`; the rule is the starting point
for Phase 5's second production adapter (UNN-647).
