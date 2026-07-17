# 2026-07-16 — Persisting the container to preserve one fact inside it

**Symptom:** a design gave a long-lived object a whole persistent *container*
(a shared mutable MapInstance) so that one small fact inside it would survive —
and every repair the review then demanded (identity columns, freeze-at-end,
historical clones, sweep, re-sync, provenance) was machinery serving the
container, not the product. Meanwhile every existing consumer identified
records *through* that container (encounter↔dungeon by `mapInstanceId`
equality, watch pages, snapshots, cleanup — all assuming instance-per-run),
so sharing it silently falsified "frozen history."

**Context:** procedural-dungeons technical design D5 (2026-07-08), reversed
2026-07-16 during the implementation-readiness review. Cost: a 13-finding
review round; avoided cost: sweep + re-sync + connection-provenance modules
and an encounter/history identity migration.

**Position:** `region.mapInstanceId` (one shared instance, swept per visit) →
replaced by `region.staticReveal: Record<sourceMapId, revealedIds>` — the
only fact that had to outlive the visit — folded at expedition finish,
re-applied at start/graft. Expeditions keep ordinary per-run instances.

**Principle:** home the *fact*, not its container: when a fact must outlive a
lifetime, extract and home the fact on the longer-lived object instead of
promoting the whole container across lifetimes (→ Code Style #10; Parnas —
hide the decision, not the data structure). A shared mutable object also
inherits every consumer's identity assumptions — sharing is an interface
change even when no signature changes.

**Action:** D5 re-decided in `docs/procedural-dungeons/technical-design.md`
(2026-07-16 revision); no ticket — caught before implementation.
