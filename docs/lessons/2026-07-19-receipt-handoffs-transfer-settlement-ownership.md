# 2026-07-19 — Receipt handoffs can leave two barriers owning one failure

**Symptom:** a failed pre-effect mutation was reported by the barrier that captured it, then reported again by the next barrier even though no new mutation had been accepted.

**Context:** UNN-651's React pre-effect journal forwarded its proxied receipt through the managed controller's normal tracked mutation path, so both journals retained the same failure.

**Position:** `entry.resolve(created.mutate(entry.invocation))` transferred execution but duplicated settlement ownership; the handoff now uses an internal untracked dispatch while the original journal keeps sole ownership.

**Principle:** a handoff transfers authority; it must not silently leave both sides authoritative for the same fact (Hunt & Thomas, DRY — one authority per piece of knowledge).

**Action:** added an explicit managed-receipt handoff seam and a React regression test proving a captured failure is consumed by exactly one call-time barrier.
