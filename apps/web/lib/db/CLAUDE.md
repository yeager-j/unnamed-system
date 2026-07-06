# `lib/db` — persistence

`lib/db/` is grouped by role:

```
lib/db/
├── client.ts        Lazy Drizzle client (db, getDb)
├── index.ts         Barrel: re-exports client + schema (import via @/lib/db)
├── env.ts           DB env resolution
├── seed.ts          Idempotent dev/E2E seed (npm run db:seed)
├── schema/          Drizzle tables + columns; v1 row types (CharacterRow, …) are owned by @workspace/game/foundation; the v2 `entity` table (UNN-551) owns its own `EntityRow` off the table (it is the component-column projection of the durable ComponentRegistry) and conformance.test.ts proves both the v1 tables and the entity column-set ↔ registry match
├── migrations/      drizzle-kit SQL migrations + meta
├── queries/         Reads: load-character (central v1 loader), load-entity (UNN-551: by-id + batch entity-row reads the combat durable arm assembles), character-list, versions, encounter-lock (the UNN-330 live-encounter lock primitives — isCharacterLiveEncounterCombatant / memberHasLiveEncounterCombatant, now over `entity`, consumed by the delete/unplace/kick/leave writes), load-dungeon (UNN-462: by-shortId row + campaignId resolver for the DM-write gate + version for stale-retry)
└── writes/          Per-concern persistence wrappers + the version-guard primitive
```

**Wrapper naming rule:** files in `queries/`/`writes/` are named for the
character-state slice or operation they touch, with **no `character-` prefix**
(the folder already says "character db") — `writes/virtues.ts`,
`writes/combat-state.ts`, `queries/versions.ts`, matching peers like
`writes/inventory.ts`/`writes/rest.ts`. Keep `character` in the name **only**
when the whole character is the operation's object: `queries/load-character.ts`,
`queries/character-list.ts`, `writes/delete-character.ts`,
`writes/start-character-draft.ts`. Every write composes through
`writes/version-guard.ts` (UNN-248); `lib/actions/CLAUDE.md` documents the
owner-mode write pattern these back.
