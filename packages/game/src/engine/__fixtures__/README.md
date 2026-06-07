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
  - `makeStatContext(overrides)` — the stat-computation view (generalizes the inline `makeWarrior`/`makeMage` the combat tests grew).
- `fixtures.ts` — item + passive-Skill data fixtures (`weaknessArmor`, `magicAccessory`, `nullElecSkill`, `accessoryWithEffects(...)`, …).
- `index.ts` — barrel; import from `@/lib/game/__fixtures__`.

Grow the kit per slice. New builders are welcome — keep them override-driven and
cloned per call.

## Running the tools (from `apps/web`)

```bash
npm run test:coverage                                   # branch gap-list (lib/game), HTML under coverage/
npx stryker run --mutate lib/game/<slice>.ts            # mutation score for one slice
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
