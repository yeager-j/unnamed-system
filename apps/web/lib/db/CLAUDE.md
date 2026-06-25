# `lib/db` — persistence

`lib/db/` is grouped by role:

```
lib/db/
├── client.ts        Lazy Drizzle client (db, getDb)
├── index.ts         Barrel: re-exports client + schema (import via @/lib/db)
├── env.ts           DB env resolution
├── seed.ts          Idempotent dev/E2E seed (npm run db:seed)
├── schema/          Drizzle tables + columns; row types (CharacterRow, …) are owned by @workspace/game/foundation, conformance.test.ts proves the tables match
├── migrations/      drizzle-kit SQL migrations + meta
├── queries/         Reads: load-character (central loader), character-list, versions, encounter-lock (the UNN-330 live-encounter lock primitives — isCharacterLiveEncounterCombatant / memberHasLiveEncounterCombatant, consumed by the delete/unplace/kick/leave writes), load-dungeon (UNN-462: by-shortId row + campaignId resolver for the DM-write gate + version for stale-retry)
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
