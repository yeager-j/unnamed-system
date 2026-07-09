# `lib/db` — persistence

`lib/db/` is grouped by role:

```
lib/db/
├── client.ts        Lazy Drizzle client (db, getDb)
├── index.ts         Barrel: re-exports client + schema (import via @/lib/db)
├── env.ts           DB env resolution
├── seed.ts          Idempotent dev/E2E seed (npm run db:seed) — mints `entity` rows via `seedCharacterToEntity`
├── seed-entity.ts   The seed's SeedCharacter → `entity` row writer
├── schema/          Drizzle tables + columns. The v2 `entity` table (UNN-551) owns its own `EntityRow` off the table — the component-column projection of the durable ComponentRegistry; conformance.test.ts pins the column-set ↔ registry correspondence. (The v1 character tables were dropped in UNN-562.)
├── migrations/      drizzle-kit SQL migrations + meta
├── queries/         Reads, over `entity` + the campaign/encounter/dungeon/map aggregates: load-entity (by-id + batch entity-row reads the combat durable arm + the character read side assemble), character-list, load-party-vitals (batch resolve → token HP/SP), encounter-lock (UNN-330 live-encounter lock primitives, over `entity`), load-dungeon / load-encounter-v2 / load-combat-console-data-v2 / load-campaign / load-map
└── writes/          Per-concern persistence wrappers for the **non-character** aggregates — campaign, dungeon, encounter, map, map-instance — plus the `guard-many` version-guard helper
```

**Durable character writes do not live here** — they go through the **entity
door**: `lib/entity/commit` (the serializable write descriptor + `ENTITY_WRITERS`
pure predictors) dispatched through `lib/actions/entity/` (`commitEntityWrite` +
`bumpEntityVersionGuarded`, version-guarded on the `entity` row's per-write-class
columns). `lib/actions/CLAUDE.md` documents that pattern. The v1 per-concern
character wrappers + `version-guard` primitive retired with the v1 sheet (UNN-562).

**Wrapper naming rule** (still holds for the surviving aggregates): files in
`queries/`/`writes/` are named for the slice or operation they touch, with **no
aggregate prefix** (the folder already says which db) — `writes/map.ts`,
`writes/dungeon.ts`, `queries/load-encounter-v2.ts`.
