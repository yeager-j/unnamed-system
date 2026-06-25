# `packages/game` (`@workspace/game`)

The pure game engine + data, extracted from `apps/web/lib/game` (see
`docs/engine-reorg`). A runtime-pure leaf — no React/Next/DB — split into three
layers under `src/`, each its own barrel entry point:

```
packages/game/src/
├── foundation/   types, Zod schemas, fixed vocabulary (LINEAGES, VIRTUE_KEYS, DAMAGE_TYPES),
│                 scalar constants, the generic Result primitive (result.ts), and the
│                 persisted-row contract (character/records.ts: CharacterRow etc.). No real logic.
├── data/         the hardcoded catalogs (skills/items/archetypes/enemies + their per-category
│                 index.ts slices and get* registries; catalog/createCatalog). Authored truth.
└── engine/       the pure functions — char optimistic reducer (character/reduce/* +
                  reduce-character.ts), encounter tracker (encounter/reduce/* + reduce-session +
                  selectors + view-shapers), dungeon/ (the exploration turn loop — reduceDungeon +
                  reminder/roster selectors, UNN-463; no deps, not in createGameEngine),
                  stats/leveling/derive, combat math, the mechanics
                  behavior modules + registry, the enemy view-models, and combatant/ (the
                  provenance-neutral `Statblock` + statblockFromCharacter/statblockFromEnemy
                  derivers PCs and enemies share — UNN-350). The Stryker target.
```

- **Imports:** consumers (apps/web) import a layer barrel — `@workspace/game/{foundation,data,engine}`;
  package-internal files import the **deep module** (`@workspace/game/<layer>/<file>`), never a
  layer barrel (cycles). `sideEffects: false` + Next `optimizePackageImports` neutralize the
  barrel cost.
- **Dependency rule:** `engine → data → foundation`. Type-only imports across layers are free;
  `engine → data` **value** imports are the inversion-debt backlog being paid down by **UNN-354**
  via the lookup **port**: `engine/ports.ts` declares the single `GameData` interface over
  foundation types that the engine owns and `data` implements — `data/game-data.ts` exports the
  single `gameData` adapter satisfying it. Each engine function declares the **exact slice it
  calls** as an inline `Pick<GameData, ...>` (so a signature documents precisely which lookups it
  touches), and every factory-bound boundary function (`buildStatContext`,
  `deriveHydratedCharacter`, `reduceCharacter`, the archetype display shapers, …) is curried
  **deps-first**: an outer call takes its lookup slice (+ `newId` where it mints ids), the inner
  call takes the runtime args. `createGameEngine` is one uniform sweep of those outer calls;
  `apps/web/lib/game-engine.ts` is the **composition root** that binds `gameData` once and
  re-exports the pre-bound versions app code calls. Mechanics registry (`getMechanic`) is
  engine-owned behavior, **not** a data port (carved out). `foundation` still has a few value
  imports from `engine`/`data` (attack vocab, mechanic state-schemas) — a known follow-up.
- The persisted-row types (`CharacterRow`, …) are **owned in `foundation/character/records.ts`**; the
  Drizzle tables in `lib/db/schema` import them and a `conformance.test.ts` proves the table
  matches (so they can't drift). `EnemyDefinition` family (humanoid/beast/…) is lifted to a
  display/filter vocab by `getEnemyFamily` in the enemies registry. `mechanics/registry.ts` is
  keyed by `kind` over a closed union (carries behavior), **not** a `createCatalog` catalog.
- **Tests + fixtures live in the package** (`src/**/*.test.ts`, `src/engine/__fixtures__/`).
  Engine tests are split three ways (UNN-363; rubric in `__fixtures__/CLAUDE.md`):
  co-located `<slice>.test.ts` are fixture-backed **unit** tests (one module in
  isolation); `src/engine/__integration__/*.integration.test.ts` are fixture-backed
  **collaboration** tests (a subject composing ≥2 concerns — the derive→reduce
  pipeline, session reducer/factory, encounter view-shapers, `buildStatContext`,
  `statblock`); `src/engine/__contract__/*.contract.test.ts` are the **only** engine
  tests that import the real catalog (`@workspace/game/data`, `gameData`) — a thin
  real-data smoke layer, excluded from the Stryker run via `vitest.mutation.config.ts`.
  As of UNN-361 the suite is **fully data-pure outside `__contract__`** — no
  exceptions. Run a layer with `npm run test:contract` / `test:integration`.

## Test-signal tooling for the engine (UNN-351) — run from `packages/game`

- `npm run test:coverage` — Vitest branch coverage **scoped to `src/engine/**`** (config in `packages/game/vitest.config.ts`). A **gap-finder, not a gate**: no thresholds, no CI check. Read the *uncovered-branch* list (HTML under `packages/game/coverage/`); ignore the headline %. The engine is where almost every branch is a rule, so an un-executed branch is a rule no test ran; a quota would just invite low-value line-touching tests. Don't add a threshold.
- `npm run test:mutation` — Stryker (`packages/game/stryker.conf.mjs`): the measure coverage can't give — of the plausible mistakes one could introduce, what fraction the tests catch (the _mutation score_). `mutate` is the whole engine layer (`src/engine/**`; `__fixtures__` excluded). A full run is ~2.5 min — **not** on the PR critical path: run it nightly or scope `mutate` to changed engine files when iterating; never block a PR on a full run. Triage survivors as real-gap vs equivalent-mutant (HTML under `packages/game/reports/mutation/`). Mutation finds gaps branch coverage rates "fine" — e.g. it flagged `skillAttackRollContext`'s entirely-unexercised ailment arm in an 85%-branch-covered file.
- **Hardening a slice's tests** (decouple from catalog data via fixtures, then drive the mutation score up): use the shared kit + follow the rubric in `packages/game/src/engine/__fixtures__/CLAUDE.md` (UNN-352). Build inputs from the fixtures (`makeRawCharacterInputs`, `makeStatContext`, …) so logic tests assert behavior, not balance numbers; document genuine equivalent mutants with `// Stryker disable` + a reason; never `as any` impossible inputs or disable just to lift the score.
