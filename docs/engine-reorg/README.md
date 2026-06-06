# Extract `lib/game` → `packages/game` (Data / Engine / Foundation)

Status: **planned** (not yet executed). Decision record + execution checklist for
extracting `apps/web/lib/game` into its own Turborepo package, `packages/game`,
internally split into three layers (`foundation` / `data` / `engine`).

## Why

`lib/game` currently organizes by **domain** (`skills/`, `combat/`, `encounter/`,
…), and each domain file co-locates three different kinds of thing: authored
**data** (catalog definitions), pure **engine** logic, and the shared
**type/vocabulary** layer both depend on. That muddiness is why mutation testing
needs the `--ignoreStatic` workaround and why `mutate`/CI can't cleanly target
"the engine."

A **coupling audit** (2026-06) found `lib/game` is already a runtime-pure leaf:
no React / Next / `server-only`, no auth / storage / actions / components imports.
Its *only* tether to the app is a **type-only** edge to `@/lib/db/schema` — 8
files importing 4 Drizzle row types. db→game is heavy (22 files) and correct;
game→db is the one wrong-direction edge. Severing it (Step 0) makes `game` a
clean leaf, which is why a package — not just a directory split — is on the table.

The package buys, over a directory reorg + lint rule:

- **Boundary by module resolution, not convention** — the package `exports` map
  *is* the public API; the three layers become entry points
  (`@unnamed/game/{foundation,data,engine}`) the app physically can't bypass.
- **Turbo caching at the package graph** — "test / mutate only when the engine
  changes" becomes natural (the package is a cache node), not a CI path-filter hack.
- **Purity as a structural invariant** — once packaged, an accidental
  `import "next/…"` won't resolve.
- and the layer wins: scope Stryker to `engine/**`, drop `--ignoreStatic`, give
  "should this be tested?" a crisp per-layer answer.

**Not for reuse** — there's no second consumer and MVP scope rules out separate
tooling. The win is enforcement + a clean test-signal home + forced purity.

## The three layers and the one rule

| Layer | Holds | Tested by |
|---|---|---|
| **`foundation/`** | types, Zod schemas, fixed vocabulary (`LINEAGES`, `VIRTUE_KEYS`, `DAMAGE_TYPES`), shared scalar constants | nothing / compile-time (no real mutants) |
| **`data/`** | catalog definitions, the `*_BY_KEY` maps, per-entry files, `get*` lookups, `createCatalog` | structural-invariant meta-tests only (e.g. `registered-entries`) |
| **`engine/`** | pure functions: reducers, stats, combat math, encounter logic, view-shaping, mechanics behavior | full fixture suite — **99% Stryker target** |

**Dependency rule:** `engine → data → foundation`, and `engine → foundation`.
`data` never imports `engine`. Type-only imports across any boundary are free
(erased at runtime, no coupling, no mutants). A **value** import `engine → data`
is the inversion debt we pay down with seams over time — after the move,
`grep -rE "from \"@/lib/game/data" engine/` (and relative equivalents) is the
exact backlog. `engine → foundation` value imports are fine (permanent axioms,
not swappable content).

## Target tree

```
packages/game/
  package.json          (name "@unnamed/game"; mirror packages/ui — source, transpilePackages, no build step)
  tsconfig.json
  vitest.config.ts      (moves from apps/web — owns the engine test signal)
  stryker.conf.mjs      (moves from apps/web — mutate scoped to src/engine/**)
  src/
    foundation/
    data/
    engine/
    __fixtures__/        (engine-test doubles)
```

`apps/web` depends on `@unnamed/game`; all destination paths in the move map
below are under `packages/game/src/`.

## Decisions locked

- **Barrels: dropped.** The **top-level domain barrels** (`skills/index.ts`,
  `combat/index.ts`, `character/index.ts`, `encounter/index.ts`,
  `archetypes/index.ts`, `items/index.ts`, `enemies/index.ts`, `mechanics/index.ts`)
  re-export across all three layers, which is the muddiness we're removing. Delete
  them; repoint importers to layered paths. **This does *not* include the
  per-category slice indexes** (`skills/fire/index.ts`, `items/weapon/index.ts`,
  `enemies/5e/beast/index.ts`, …) — those are data and move to `data/` with their
  slice. (IDE "move file" updates most refs; the barrel deletions are the manual
  repoint.)
- **`character/lineage.ts` → `foundation/` whole.** It's lineage vocab + maps +
  one trivial `startingWeaponForLineage` lookup; not worth a 5th split. We accept
  that one-line lookup isn't mutation-tested.
- **Mechanics are engine.** `mechanics/<lineage>/*` carry behavior
  (`initialState`/`reduce`/effects), so they live in `engine/`, despite being
  registered like content. `mechanics/registry.ts` (closed-union, behavior-keyed)
  goes with them.
- **Per-domain *schemas* are foundation, not data.** A `schema.ts` is the type
  contract imported by both data and engine, so it can't live in either — it goes
  to `foundation/`. This is what forces the four splits below.
- **Scalar rule constants stay with their engine logic** (`MASTERY_RANK` in
  `rank.ts`, `MAX_CURRENCY` in `currency.ts`, `MAX_EXHAUSTION_LEVEL`) and *are*
  mutation-tested — they're rules, not catalog content.

## Move map (by destination)

`*.test.ts` always moves with its `*.ts`.

### → `foundation/` (whole-file)
- `common.ts` (the stray top-level file: `SKILL_KINDS` / `SkillKind` vocabulary, zod-free)
- `combat/affinity.ts`, `combat/effects.ts`
- `character/state.ts`, `character/hydrated-character.ts`, `character/character-edit.ts`, `character/lineage.ts`
- `character/records.ts` (the persisted-row contract — added in Step 0)
- `encounter/session-event.ts`, `encounter/status.ts` (added in Step 0)
- `mechanics/types.ts`, `mechanics/schema.ts`
- `skills/schema.ts`, `items/schema.ts`, `enemies/schema.ts`
- *(plus the schema/type halves of the four splits)*

### → `data/` (directory-level; per-entry files confirmed logic-free)

The per-category **slice indexes** (`skills/fire/index.ts` → `FIRE_SKILLS`,
`items/weapon/index.ts`, `enemies/5e/beast/index.ts`, …) are **data** — they
move with their slice under the `*` wildcards below. Do **not** confuse these
with the top-level domain barrels (deleted in step 5).

- `skills/<element>/*` + `skills/registry.ts`
- `items/<slot>/*` + `items/registry.ts`
- `archetypes/<lineage>/*` + `archetypes/demo/*` + `archetypes/registry.ts`
- `enemies/5e/**` + `enemies/registry.ts`
- `catalog/create-catalog.ts` + `catalog/registered-entries.ts`
- *(plus the definition/registry halves of the four splits)*

### → `engine/` (whole-file, grouped)
- `engine/character/`: `reduce/*`, `reduce-character`, `stats/*`, `leveling`, `derive-hydrated-character`, `adjust-pools`, `currency`, `virtues/utils`, `talents/utils`, `talents/display`
- `engine/combat/`: `attack-roll`, `attack`, `rest`, `exhaustion`, `side-effects`
- `engine/encounter/`: `reduce/*`, `reduce-session`, `selectors`, `initiative`, `end-of-turn`, `fallen`, `resolve-engagement`, `resolve-zone-layout`, `resolve-player-view`, `zone-graph`, `roster-view`, `setup-roster-view`, `player-snapshot`, `console-view`
- `engine/archetypes/`: `atlas`, `utils`, `inheritance`, `rank`
- `engine/enemies/`: `catalog-rows`, `enemy-detail-view`, `hydrate-enemy-skills`
- `engine/mechanics/`: `registry` + `healer/ knight/ mage/ warlock/ warrior/`
- `engine/skills/`: `utils`
- `engine/items/`: `utils`, `mutate`

## Step 0 — sever the `game → db` type cycle (do first; required for packaging)

`game` is a clean leaf except for **8 files** importing 4 Drizzle row types from
`@/lib/db/schema`: `CharacterRow`, `CharacterArchetypeRow`, `InventoryItemRow`
(`schema/character.ts`), `EncounterStatus` (`schema/encounter.ts`). A package
can't import from the app, so this edge must be severed first.

The wrinkle: those types are `typeof <table>.$inferSelect` — **inferred from**
the Drizzle tables, which can't move (they pull in `drizzle-orm`, FK refs,
`drizzle-zod`). So game must *re-declare* the persisted contract; db conforms.

**Status: done (this PR).** The game domain now owns the persisted contract:

- `lib/game/character/records.ts` declares `CharacterRow`, `CharacterArchetypeRow`,
  `InventoryItemRow`, `CharacterKnifeRow`, `CharacterChainRow`, and
  `CharacterStatus`; `lib/game/encounter/status.ts` declares `EncounterStatus`.
  They reuse the game jsonb types game already owns, so only the flat scalar
  columns are hand-listed. (Names are **kept** — not `*Record` — so there are no
  usage renames; only import sources change. Knife/Chain rows turned out to be
  consumed by the hydration layer too, so all five row types moved.)
- `lib/db/schema` imports these (db → game, the correct direction), uses them for
  its `.$type<>()` columns, and **re-exports** them under the same names — so the
  ~22 db consumers and every app importer are untouched.
- The drift guard is `lib/db/schema/conformance.test.ts`: a typechecked
  `expectTypeOf<typeof <table>.$inferSelect>().toEqualTypeOf<…Row>()` for all five
  tables. A column added/changed without updating the game record fails
  `npm run typecheck`, so the table and the contract can't silently drift.
- `HydratedCharacter` is unchanged (`CharacterRow & { …derived }`), so nothing
  downstream breaks.

`grep -r "@/lib/db" lib/game` is now empty (source *and* tests) — the package can be cut.

**Cost:** the column list lives in two places (the Drizzle table + the game
record), kept honest by the conformance test. That's the price of `game` being a leaf.

## The four splits (do these *first*, as IDE "move members to file" refactors)

Each separates a file along the layer boundary. The data/engine half imports the
schema half; the schema half imports neither — no cycles.

### 1. `archetypes/schema.ts`
- **Keep (→ `foundation/archetypes.ts`):** everything except `resolveAffinity`
  (the `ARCHETYPE_TIERS`/`ATTRIBUTE_KEYS` vocab, all Zod schemas, `Archetype` &
  related types, the `LINEAGES` re-export).
- **Move → `engine/archetypes/affinity.ts`:** `resolveAffinity`. Imports
  `type Archetype` from the schema file and `Affinity`/`DamageType` from
  `foundation/affinity`.
- External importer to repoint: `character/stats/stats.ts`.

### 2. `encounter/session.ts`
- **Keep (→ `foundation/session.ts`):** every schema + type
  (`enemyStatBlockSchema`/`EnemyStatBlock`, `zoneSchema`/`Zone`, `COMBAT_SIDES`,
  `COMBAT_ADVANTAGES`, `combatantRefSchema`/`CombatantRef`,
  `engagementSchema`/`Engagement`, `conditionDurationsSchema`/`ConditionDurations`,
  `combatantSchema`/`Combatant`, `combatSessionSchema`/`CombatSession`,
  `combatantSetupSchema`/`CombatantSetup`). Imports from `foundation/character-state`.
- **Move → `engine/encounter/session-factory.ts`:** `makeCombatant`,
  `toCombatantSetup`, `createCombatSession`. Import the types from
  `foundation/session` and `DEFAULT_BATTLE_CONDITIONS` from `foundation/character-state`.
- Importers to repoint: `createCombatSession` (→ `reduce-session.ts`, the four
  `lib/actions/encounter/*` files), `makeCombatant` (→ the `addCombatant`/draft
  slice), `toCombatantSetup` (→ the setup UI).

### 3. `combat/ailments.ts`
- **Keep (→ `foundation/ailments.ts`):** `AILMENT_KEYS`, `AilmentKey`,
  `ailmentSchema`, `Ailment`.
- **Move → `data/ailments.ts`:** `AILMENTS_BY_KEY` (private), `AILMENTS`,
  `getAilment`. Imports `AilmentKey`/`Ailment` from `foundation/ailments`.
- Importers to repoint: `getAilment`/`AILMENTS` (4 components).

### 4. `character/talents/registry.ts` (also aligns talents with its `skills`/`items` siblings)
- **New `character/talents/schema.ts` (→ `foundation/talents.ts`):** `TALENT_KEYS`,
  `TalentKey`, `MAX_PLAYER_ADDED_TALENTS`, `talentSchema`, `Talent`,
  `gainedTalentsSchema`.
- **Keep in `registry.ts` (→ `data/talents.ts`):** `TALENT_NAMES` (private),
  `TALENTS_BY_KEY` (private), `TALENTS`, `getTalent`. Imports `TalentKey`/`Talent`
  from `./schema`.
- Importers to repoint: the many `TalentKey`/`TALENT_KEYS` consumers → `schema`;
  `getTalent`/`TALENTS` consumers stay on `registry`.

## Tooling changes (land in the move PR)

These move *into* the package (it owns its own test signal):

- **`packages/game/stryker.conf.mjs`:** `mutate: ["src/engine/**/*.ts", "!src/engine/**/*.test.ts"]`;
  drop the `--ignoreStatic` workaround; consider `coverageAnalysis: "perTest"` for
  speed now that static-heavy data is excluded.
- **`packages/game/vitest.config.ts`:** coverage `include` scoped to `src/engine/**`.
- **CI:** the mutation job keys off the `@unnamed/game` package (Turbo cache) —
  runs only when the package changes; never blocks on a full run.
- **ESLint:** an import-boundary rule forbidding `engine` from value-importing
  `data` (type-only allowed) — turns the inversion debt into a lint signal. (The
  package `exports` map already blocks reaching *internals* from `apps/web`.)
- Update root `CLAUDE.md` (Repo Structure + Testing) to describe `packages/game`
  and its layers; the `apps/web/CLAUDE.md` pointers that reference `lib/game/*`.

## Execution order

1. ✅ **Step 0** — sever the `game → db` type cycle (done, this PR). `lib/game`
   now has zero app coupling (source + tests).
2. Branch (zero other open `lib/game` branches — this conflicts with everything).
3. Scaffold `packages/game` (`package.json` + `tsconfig` mirroring `packages/ui`;
   add `@unnamed/game` to `apps/web` deps + `transpilePackages`).
4. Do the **four splits** (IDE move-members-to-file).
5. **Whole-file moves** per the map into `packages/game/src/{foundation,data,engine}`
   (IDE move; let it fix imports).
6. Delete the **top-level domain barrels** (`skills/index.ts`, `combat/index.ts`,
   …) — **not** the per-category slice indexes (`skills/fire/index.ts` & friends),
   which move with their data — and repoint stragglers to the package entry points.
7. Move the Stryker/Vitest configs into the package; add the ESLint boundary rule;
   update `CLAUDE.md`; flip this doc's status → done.
8. Verify: `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build` green.
9. Scoped Stryker on the package's `engine/**` to confirm parity (~same scores).

## Verification & follow-up

- After the move, `grep` engine→data **value** imports → that's the seam backlog
  (pay down per future wave, same pattern as `buildLineageAtlas`/`reduceUnlockArchetype`).
- **UNN-350** (boundary + stats + enemy view-models) is authored *after* this, so
  it lands directly in `engine/encounter/`, `engine/character/stats/`,
  `engine/enemies/` with the new tooling.
- **Future `packages/db`** — when a second app (mobile, a second Next.js app)
  needs persistence, lift `lib/db` into its own package depending on
  `@unnamed/game` (db → game is the correct direction; Step 0 guarantees game
  never imports db, so no cycle). It sits *above* game in the graph: `game`
  (leaf) ← `db` ← `apps/*`. Not worth doing until a second consumer is real —
  but Step 0 is what unlocks it.
