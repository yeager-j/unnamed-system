# `lib/db` — persistence

`lib/db/` is grouped by role:

```
lib/db/
├── client.ts        Lazy Drizzle client (db, getDb)
├── index.ts         Barrel: re-exports client + schema (import via @/lib/db)
├── env.ts           DB env resolution
├── seed.ts          Idempotent dev/E2E seed (npm run db:seed) — mints `entity` rows via `seedCharacterToEntity`
├── seed-entity.ts   The seed's SeedCharacter → `entity` row writer
├── schema/          Drizzle tables + columns. The v2 `entity` table (UNN-551) owns its own `EntityRow` off the table — the component-column projection of the durable ComponentRegistry; conformance.test.ts pins the column-set ↔ registry correspondence. (The v1 character tables were dropped in UNN-562.) `replica-client.ts` (UNN-645) is the per-(tab × entity) mutation dedup ledger for the replica push door — last-outcome-only rows, swept opportunistically by that door's processor.
├── migrations/      drizzle-kit SQL migrations + meta
├── queries/         Reads, over `entity` + the campaign/encounter/dungeon/map aggregates: load-entity (by-id + batch entity-row reads the combat durable arm + the character read side assemble), character-list, load-party-vitals (batch resolve → token HP/SP), encounter-lock (UNN-330 live-encounter lock primitives, over `entity`), load-dungeon / load-encounter-session / load-combat-console-data / load-campaign / load-map
└── writes/          Per-concern persistence wrappers for the **non-character** aggregates — campaign, dungeon, encounter, map, map-instance — over the shared `guarded-update` (`guardedVersionUpdate`, the single-`version` optimistic-concurrency guard) plus the `guard-many` cross-row transaction helper
```

**Durable character write coordination does not live under `lib/db/writes/`.**
The serializable descriptor + `ENTITY_WRITERS` predictors live in
`domain/entity/commit`; the owner replica processor and combat's classic durable
arm compose them under `lib/actions/entity/`. `lib/actions/AGENTS.md` documents
those doors. The v1 per-concern character wrappers + `version-guard` primitive
retired with the v1 sheet (UNN-562).

Owner character surfaces use `lib/actions/entity/replica/`: its processor locks
`replicaClient` then `entity`, commits the domain patch and dedup outcome in one
transaction, and serves value/watermark/cursor through one joined snapshot read.
`domain/entity/replica/real-door-transport.db.test.ts` runs the transport laws and
duplicate-delivery serialization against the ephemeral Neon CI branch.

The combat replica (UNN-646) adds the sibling ledger `encounterReplicaClient`
(encounter-pinned, cascade-delete, same last-outcome-only retention + TTL sweep)
for the storage-native encounter root (UNN-655; formerly the inline home);
durable combat clients share `replicaClient`. **Lock
orders:** `replicaClient → entity` (owner entity door), `replicaClient →
encounters → entity` (combat durable door — the encounter carries that write's
liveness + roster license, so it is locked before the character row), and
`encounterReplicaClient → encounters` (encounter door). Ledgers first,
then aggregates outermost-scope first; no transaction
takes an aggregate row lock and then a ledger lock — except Postgres itself
during a cascade delete (parent first), whose only casualty is an in-flight
push aborting as an ambiguous, redeliverable delivery.

**Wrapper naming rule** (still holds for the surviving aggregates): files in
`queries/`/`writes/` are named for the slice or operation they touch, with **no
aggregate prefix** (the folder already says which db) — `writes/map.ts`,
`writes/dungeon.ts`, `queries/load-encounter-session.ts`.
