# 2026-07-19 — Two channels carrying one fact, and either pick races the other

**Symptom:** composing one fact (roster membership) from two sources with
independent latencies, and *both* fixed authority choices were wrong in
opposite directions — trusting the fresh-by-push side resurrected what the
other channel had deleted; trusting the fresh-by-refresh side hid what the
first had optimistically added. The failing test that exposed it looked like
a stale expectation until the mirrored race was written out.

**Context:** UNN-657, `apps/web/domain/combat/compose-combat-model.ts`.
Roster changes arrive via Replica intent (visible in the projection
immediately, in the loader frame only after revalidation) and via commands
(visible in the frame after the transition, in the root only after the
invalidation pull). The pre-existing compose test "takes roster additions and
removals only from the event frame" went red on the naive append and turned
out to be pinning one horn of the dilemma, not a stale contract.

**Position:**

```ts
const rootDecidesRoster = root !== undefined && root.version >= loaderVersion
// root-led: append root-only inline shells, drop frame-only participants;
// frame-led: the frame's roster stands until the root catches up.
```

Both sides observe the same encounter row, so the row's `version` rides in
each channel (the root value gained it — still a single-row atomic fact per
the UNN-655 posture) and recency, not identity, decides membership.

**Principle:** when one fact flows through two channels with independent
latencies, no per-channel authority assignment is race-free — the composition
needs a shared monotonic token and a newest-wins rule. This is a Lamport-clock
arbitration in miniature (kin to the causal-acceptance gate's cursor
classification; → Code Style #9 — the distinction "who decides membership" is
decided once, in the seam, not per call site).

**Action:** `EncounterReplicaState.version` + `loaderVersion` arbitration in
`composeCombatModel`, pinned by the frame-led/root-led test pair in
`compose-combat-model.test.ts` (UNN-657).
