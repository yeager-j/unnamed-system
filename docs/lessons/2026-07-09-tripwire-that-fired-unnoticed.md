# 2026-07-09 — The tripwire that fired and paged no one

**Symptom:** a docblock correctly predicted its own violation ("if a second
consumer appears, move this to spatial/selectors") — the threshold was later
crossed, the predicted duplication happened, and nothing surfaced it until an
unrelated audit.

**Context:** `lib/combat/view/zone-graph.ts` vs the inline `movableZonesFor`
reimplementation in `components/dungeon/combat/body.tsx`, found during the
post-v2 health check. Sibling instance the same week: the C6 effect-pool
ordering in `resolve-entity.ts`, guarded only by a "MUST stay" comment.

**Principle:** a normative comment is an unexecuted contract — a rule the
machine could check but only pleads for (→ Code Style #8, Design by Contract;
Hoare's assertions). Promote it up the ladder — type, exhaustive table,
property-tested law, CI gate, runtime assert — and stop at the comment rung
only as a conscious proportionality call. Comments don't page anyone.

**Action:** Code Style #8 added to CLAUDE.md; UNN-597 item 3 (the selector
move), UNN-599 (C6 ordering becomes data + a permutation law).
