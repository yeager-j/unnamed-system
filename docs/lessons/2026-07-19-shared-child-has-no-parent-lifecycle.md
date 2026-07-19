# 2026-07-19 — A shared child has no single parent's lifecycle

**Symptom:** every spatial write had to guess which parent row to lock, and a map shared by dungeon exploration and combat could still be mutated after one parent considered it finished.

**Context:** UNN-654 moved Map Instance writes from encounter/dungeon version queues to a dedicated replica; the old cross-row protocol duplicated lifecycle authority and made ordering depend on the current UI root.

**Position:** `await loadMapInstanceForWriteLocked(tx, mapInstanceId)` now returns `map-instance-frozen` before any mutation, while lifecycle commands freeze the same locked row.

**Principle:** home lifecycle permission on the object whose lifetime it governs (→ Code Style #10; Parnas information hiding).

**Action:** added `mapInstance.status`, centralized locked writes, and made all spatial surfaces use the Map Instance Replica.
