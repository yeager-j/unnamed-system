# `lib/game` reorg — Data / Engine / Foundation

Status: **planned** (move not yet executed). This doc is both the decision record
and the execution checklist for splitting `apps/web/lib/game` into three layers.

## Why

`lib/game` currently organizes by **domain** (`skills/`, `combat/`, `encounter/`,
…), and each domain file co-locates three different kinds of thing: authored
**data** (catalog definitions), pure **engine** logic, and the shared
**type/vocabulary** layer both depend on. That muddiness is why mutation testing
needs the `--ignoreStatic` workaround and why `mutate`/CI can't cleanly target
"the engine." Separating the layers lets us:

- scope Stryker to `engine/**` and drop `--ignoreStatic`,
- trigger the mutation job in CI only when engine code changes,
- make the data→engine dependency direction **greppable** (and lintable), and
- give "should this be tested?" a crisp answer per layer.

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
lib/game/
  foundation/
  data/
  engine/
  __fixtures__/        (move under engine/__fixtures__ — they're engine-test doubles)
```

## Decisions locked

- **Barrels: dropped.** The per-domain `index.ts` barrels currently re-export
  across all three layers, which is the muddiness we're removing. Delete them;
  repoint importers to layered paths. (IDE "move file" updates most refs; the
  barrel deletions are the manual repoint.)
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
- `combat/affinity.ts`, `combat/effects.ts`
- `character/state.ts`, `character/hydrated-character.ts`, `character/character-edit.ts`, `character/lineage.ts`
- `encounter/session-event.ts`
- `mechanics/types.ts`, `mechanics/schema.ts`
- `skills/schema.ts`, `items/schema.ts`, `enemies/schema.ts`
- *(plus the schema/type halves of the four splits)*

### → `data/` (directory-level; per-entry files confirmed logic-free)
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

- **`stryker.conf.mjs`:** `mutate: ["lib/game/engine/**/*.ts", "!lib/game/engine/**/*.test.ts"]`;
  remove the `--ignoreStatic` workaround from the workflow; consider revisiting
  `coverageAnalysis: "perTest"` for speed now that static-heavy data is excluded.
- **`vitest.config.ts`:** scope coverage `include` to `lib/game/engine/**`.
- **CI:** a mutation job gated on a `lib/game/engine/**` paths filter (runs only
  when engine code changes; never blocks on a full run).
- **ESLint:** a `no-restricted-imports` (or import-boundary) rule forbidding
  `engine` from value-importing `data` (type-only allowed) — turns the inversion
  debt into a lint signal.
- Update `CLAUDE.md` Repo Structure + the Testing section to describe the layers.

## Execution order

1. Branch (zero other open `lib/game` branches — this conflicts with everything).
2. Create `foundation/`, `data/`, `engine/`.
3. Do the **four splits** (IDE move-members-to-file).
4. **Whole-file moves** per the map (IDE move; let it fix imports).
5. Delete the per-domain `index.ts` barrels; repoint any stragglers to layered paths.
6. Tooling changes + `CLAUDE.md` + this doc's status → done.
7. Verify: `npm run typecheck`, `npm run test`, `npm run lint` all green.
8. Scoped Stryker on `engine/**` to confirm parity (~same scores as today).

## Verification & follow-up

- After the move, `grep` engine→data **value** imports → that's the seam backlog
  (pay down per future wave, same pattern as `buildLineageAtlas`/`reduceUnlockArchetype`).
- **UNN-350** (boundary + stats + enemy view-models) is authored *after* this, so
  it lands directly in `engine/encounter/`, `engine/character/stats/`,
  `engine/enemies/` with the new tooling.
