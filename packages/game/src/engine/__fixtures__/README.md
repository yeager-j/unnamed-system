# Game-engine test fixtures + mutation-hardening rubric

Test-only builders and data for the pure game engine (`lib/game/**`), plus the
rubric for hardening a slice's tests against mutation testing (UNN-352, following
UNN-351). Nothing here is imported by app or catalog code.

## Why fixtures

Engine logic tests should assert **behavior**, not **balance numbers**. A test
that imports the real `slashBoost` (+2) and asserts the total is +2 breaks when
that skill is rebalanced — even though the folding logic is fine. Synthetic
fixtures decouple logic tests from catalog tuning, and let tests reach legal
combinations the catalog can't currently express (e.g. a passive carrying an
attribute effect, an Archetype mid-mechanic-state).

Reserve real catalog entries for a thin layer of integration/smoke tests; build
everything else from fixtures.

## The kit

- `character.ts` — input-shape builders:
  - `makeRawCharacterInputs({ row?, archetypeRows?, inventoryRows?, knives?, chains? })` — the `RawCharacterInputs` the reducers + `deriveHydratedCharacter` consume. `row` merges shallowly over a Level-1 balanced default; collections default to empty.
  - `makeArchetypeRow(overrides)` — a `characterArchetype` row; pass `mechanicState` to seed a mechanic mid-state.
  - `makeStatContext(overrides, data?)` / `makeCastContext(overrides, data?)` — the stat-computation view (and its cast-flow superset with live pools); generalizes the inline `makeWarrior`/`makeMage` the combat tests grew.
  - `makeHydratedCharacter(overrides, data?)` — derives a full `HydratedCharacter` through the real `deriveHydratedCharacter`.

  **Catalog default (UNN-360):** the three derived-view builders above resolve their Archetypes/Skills through an injected `GameData` that **defaults to an empty `makeTestGameData()`** — so a behavior test is fixture-backed by default and can never *silently* reach the real catalog through the kit. Pass a `makeTestGameData({...})` adapter to derive against fixtures, or pass the real `gameData` as a **visible opt-in** when a slice deliberately asserts shipped balance (a forgotten arg yields an empty catalog that fails loud, not a hidden coupling).
- `fixtures.ts` — item + passive-Skill data fixtures (`weaknessArmor`, `magicAccessory`, `nullElecSkill`, `accessoryWithEffects(...)`, …).
- `skills.ts` — minimal `Skill` builders: `makePassiveSkill(overrides)` (the default "this key resolves" fixture) and `makeAttackSkill(overrides)` (carries a payable `cost` for the cast flow). Keys are opaque ids — assert behavior, not the shipped Skill's balance.
- `talents.ts` — `makeTalent(key, name)`: a minimal `Talent` for label-resolution tests. `key` is a real `TalentKey` used as an opaque id; tests assert alpha-by-name ordering against the fixture `name`, never the shipped label.
- `enemies.ts` — `makeEnemy(overrides)`: a minimal `EnemyDefinition` (bare Level-1 stat block) for the enemy view-model + statblock slices. Seed only what the subject reads (`skillKeys`, `affinities`, …); real slugs are opaque ids.
- `game-data.ts` — `makeTestGameData(overrides?)`: the fixture-backed
  {@link GameData} adapter — the test-time counterpart to production `gameData`,
  for `createGameEngine(makeTestGameData({...}))` or for the boundary `*Core`
  functions / `deriveHydratedCharacter` that take a lookup explicitly. Backed by
  `Map`s over the provided fixtures; every collection (`archetypes`, `skills`,
  `talents`, `items`, `enemies`, `enemyFamilies`) defaults empty, so a test seeds
  only the catalog slice its subject reads (an unseeded lookup simply misses).
  `getEquippableItem` narrows the seeded `items` exactly as the real registry
  does. Build fixture Archetypes/Skills with `makeArchetype` + a minimal
  `Skill` literal; reference real `SkillKey`s as **opaque ids** and assign their
  Ranks in the fixture, so logic tests never depend on shipped balance.
  `makeHydratedCharacter(overrides, makeTestGameData({...}))` derives a character
  against a fixture catalog (and is the default — see the catalog-default note
  above).
- `index.ts` — barrel; import from `@/lib/game/__fixtures__`.

Grow the kit per slice. New builders are welcome — keep them override-driven and
cloned per call.

## Running the tools (from `packages/game`)

```bash
npm run test:coverage                                       # branch gap-list (src/engine), HTML under coverage/
npx stryker run --mutate "src/engine/<slice>.ts"           # mutation score for one slice
```

Coverage is a **gap-finder, not a gate** — read the uncovered-*branch* list,
ignore the %. Mutation score is the real measure: of plausible mistakes, what
fraction the tests catch.

## Hardening rubric (per slice)

Run Stryker on the slice, then for each surviving mutant, in order:

1. **Real gap →** kill it with a fixture-based test. Prefer table-driven tests
   where a guard repeats across cases (see the worked example).
2. **Registry-coupled** (the code looks up `getMechanic`/`getArchetype`/etc., so
   a fixture can't be injected) **→** add a parameter seam to the SUT, then kill
   it. (Owner reviews cross-cutting seams.)
3. **Type looser than schema →** tighten the type so the defensive branch is
   provably dead, and **delete** it. Beats killing or disabling.
4. **Genuine equivalent** — a defensive guard a downstream check or the type
   system already guarantees, or a single-member discriminated-union check —
   **→** `// Stryker disable next-line <Mutator>: equivalent — <one-line why>`.
   The comment is load-bearing documentation of the invariant.
5. **Never** `as any` to manufacture impossible inputs, and **never** disable a
   mutant just to lift the score. The goal is not "100%" — it is "every
   non-equivalent mutant killed, every survivor documented."

### Worked example — `character/reduce/mechanics.ts` (39% → 100%)

- It had no dedicated test (only indirect coverage via `reduce-character.test`).
  A fixture-built `mechanics.test.ts` took it to 82% immediately.
- The remaining survivors were **systematic**: the per-mechanic guard
  (`!active || active.current.kind !== "<kind>"`) and null-state coercion were
  only tested for one mechanic. A `describe.each` over all five mechanics —
  asserting initial-state coercion + the three no-op guards (no active
  Archetype, missing row, kind mismatch) — took it to 98%.
- The last two survivors were **genuine equivalents**: `if (!activeId)` (a null
  id matches no row, so the next guard returns null anyway) and `if (!current)`
  (`initialStateFor` returns a state for every known `MechanicKind`). Both
  disabled with reasons.

### Definition of done

- Logic tests assert behavior via fixtures, not catalog content.
- Stryker on the slice: every non-equivalent mutant killed; survivors are all
  documented equivalents (disable + reason) or removed via type/dead-code fixes.
- No `as any` impossible inputs; no score-only disables.
