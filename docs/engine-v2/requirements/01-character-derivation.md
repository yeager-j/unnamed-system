# Requirements Inventory — Character Derivation & Reducer

A testable inventory of the behavior, rules, and invariants the current pure
game engine guarantees for **character derivation** and the **optimistic
character reducer**. Each item is a statement a v2 implementation must also
satisfy. Sources are file + function within
`packages/game/src/engine/character/**` (and a few neighbors). Mined from source
and co-located `*.test.ts`.

Scope covered:
- `derive-hydrated-character.ts` (the hydration pipeline + round-trip)
- `stats/stats.ts`, `stats/stat-character.ts` (attributes / HP / SP / dice / affinity / bonus pool / context assembly / mechanic transform)
- `leveling.ts` (level-up + Spark log + Virtue rank-up)
- `adjust-pools.ts` (manual HP/SP/Prisma)
- `currency.ts`
- `talents/utils.ts`, `talents/display.ts`
- `virtues/utils.ts`
- `reduce-character.ts` + `reduce/*` (the per-domain reducer slices)
- relevant foundation shapes (`foundation/character/state.ts`)

---

## A. Hydration pipeline (`derive-hydrated-character.ts`)

A1. **Derivation is pure and I/O-free.** `deriveHydratedCharacter(lookups)(raw, context?)` turns persisted `RawCharacterInputs` (the `characters` row + archetype/inventory/knife/chain child-row sets) into a complete `HydratedCharacter` with no DB/network/React. The same function runs server-side and client-side. `source: derive-hydrated-character.ts → deriveHydratedCharacter`

A2. **Deriving twice from the same inputs yields the same view.** Determinism by construction so a client optimistic frame can never structurally drift from the server's. `source: deriveHydratedCharacter`

A3. **Persisted columns pass straight through.** The output spreads the entire `row` flat, plus `archetypeRows`, `knives`, `chains` verbatim. `source: deriveHydratedCharacter`
- `edge:` derived fields layered on top: `talents`, `inventory`, `activeArchetypeKey`, `attributes`, `maxHP`, `maxSP`, `maxHitDice`, `maxSkillDice`, `affinityChart`, `weaponAttackRoll`, `weaponDamageBonuses`, `activeMechanic`, `skills`.

A4. **Only equipped inventory items feed stat computation.** `statContext` filters `inventoryRows` to `equipped === true` before mapping to catalog keys, so item effects are gated to actually-equipped gear. `source: derive-hydrated-character.ts → statContext`

A5. **The full inventory (equipped or not) is hydrated for display.** Each `inventoryRow` is paired with its resolved catalog `item` (`lookups.getItem`) in the output `inventory`, regardless of equipped state. `source: deriveHydratedCharacter`

A6. **Weapon attack roll/damage derive from the single equipped weapon.** `getEquippedItem(inventory, "weapon")` selects the weapon; if present, `weaponAttackRoll` = `resolveAttackRoll(weaponContext, stats, partyComposition)` and `weaponDamageBonuses` = `resolveDamageBonuses(...)`; if no weapon equipped, `weaponAttackRoll` is `null` and `weaponDamageBonuses` is `[]`. `source: deriveHydratedCharacter, weaponAttackContext`
- `edge:` weapon attack context is built from the item's `equip.intrinsicAttack` (`damageType`, `delivery`, `attackRoll.attribute`).

A7. **Each derived skill carries its resolved attack-roll + damage bonuses.** For every `stats.activeSkills` entry, the output `skills` calls `hydrateSkill(skill, maxHP, attackRoll?, damageBonuses?)`; the attack-roll/damage are computed only when `skillAttackRollContext(skill)` is non-null, else `null`/`[]`. `maxHP` is threaded in so %-of-max-HP costs can resolve. `source: deriveHydratedCharacter`

A8. **`partyComposition` defaults to null off-encounter.** `context?.partyComposition ?? null` — the standalone sheet resolves party scalers (Magic Circle, Ailment Boost) at zero allies. `source: deriveHydratedCharacter`

A9. **Zone/context effects default to empty off-encounter.** `context?.zoneEffects ?? []` flows in as `StatContext.contextEffects`; omitted on the standalone sheet so no zone effects apply (base values). `source: statContext`

A10. **`toRawInputs` is the exact inverse of derivation.** Strips every derived field back off so `deriveHydratedCharacter(lookups)(toRawInputs(c))` deep-equals `c`. Inventory rows are recovered by dropping the resolved `item`. `source: derive-hydrated-character.ts → toRawInputs`
- `edge:` fields stripped: `talents`, `activeArchetypeKey`, `attributes`, `maxHP`, `maxSP`, `maxHitDice`, `maxSkillDice`, `affinityChart`, `weaponAttackRoll`, `activeMechanic`, `skills`, and `inventory[].item`. (A new derived field not mirrored here is caught by the derive tests.)

---

## B. Stat-context assembly (`stats/stat-character.ts`)

B1. **The active Archetype is resolved by surrogate id.** `buildStatContext` finds the archetype row whose `id === character.activeCharacterArchetypeId`; its `archetypeKey` becomes `activeArchetypeKey` (or `null` when none matches). `source: buildStatContext`

B2. **`activeLineage` is the active Archetype's lineage, else null.** `source: buildStatContext`

B3. **`archetypes` lists every owned Archetype with key + rank + resolved Mastery descriptor.** Built via `flatMap`; an archetype key with no catalog entry is dropped from the list. `source: buildStatContext`
- `edge:` unknown key → omitted (not zero-rank placeholder).

B4. **Equipped item keys resolve via `getEquippableItem`; unknown keys are dropped.** `source: buildStatContext`

B5. **Base attributes come from the active Archetype, else all zeros.** `baseAttributesForArchetype(activeArchetype)` returns the Archetype's intrinsic `attributes` for each `ATTRIBUTE_KEYS` entry, or `0` for every attribute when `undefined`. `source: buildStatContext, baseAttributesForArchetype`

B6. **Base affinity chart comes from the active Archetype, else all-neutral.** `baseAffinitiesForArchetype(activeArchetype)` resolves each `DAMAGE_TYPES` entry via `resolveAffinity`; uncharted types and Almighty resolve to `"neutral"`; with no active Archetype every type is `"neutral"`. `source: baseAffinitiesForArchetype`

B7. **Active skills selection: rank-gated + synthesis + inheritance + item grants, deduped.** For the active Archetype only, `activeSkillsFor` collects: every Archetype `skills[].skill` whose `ref.rank` ≤ active rank (`hasUnlockedRank`); the `synthesisSkill` when its rank ≤ active rank; each inheritance slot's `skillKey`; and any equipped item effect of `type === "skill"` (`skillKey`). Collected into a `Set` (deduped), then each key resolved via `getSkill`, dropping unresolved keys. `source: stat-character.ts → activeSkillsFor`
- `edge:` no active Archetype → `activeSkills` is `[]`. Unknown active Archetype key → `[]`. Empty inheritance slot (`skillKey` null) → contributes nothing. An equipment-granted skill the Archetype already grants is not duplicated.

B8. **Active mechanic resolution.** `activeMechanicFor`: null when no active Archetype, or the active Archetype declares no `mechanic`. Otherwise `{ kind: archetype.mechanic, state }` where `state` is the row's `mechanicState` or — when null — the mechanic's `initialState()`. `source: stat-character.ts → activeMechanicFor`
- `edge:` `getMechanic` miss returns null (guards runtime-corrupt data only; the union is exhaustive for real archetypes).

B9. **A mechanic's wholesale `transform` replaces resolved base, after assembly.** `applyMechanicTransform` runs the active mechanic's `transform(state, context)` (when one is declared) and replaces `baseAttributes`, `baseAffinities`, and `activeSkills` with whatever it returns; a field the transform omits keeps its Archetype-resolved value. `source: stat-character.ts → applyMechanicTransform`
- `edge:` no active mechanic OR mechanic declares no `transform` → returns the **same** context object reference (no-op identity). The transform receives the active mechanic's `state` and the assembled context. Every MVP mechanic declares no transform.

B10. **`toStatContext` reconstructs the context from a hydrated character.** Maps path/level/manualBonuses/activeArchetypeId, every archetype row, and the equipped (only) inventory keys. `source: stat-character.ts → toStatContext`
- `edge:` stowed (non-equipped) items are dropped.

B11. **Context assembly is deps-first curried.** `buildStatContext(lookups)(character, archetypes, equippedItemKeys, contextEffects = [])`; `contextEffects` defaults to empty. `source: buildStatContext`

---

## C. Attribute derivation (`stats/stats.ts`)

C1. **Displayed attribute = base + summed bonuses, clamped to [-7, +7].** `computeAttributes` adds the accumulated bonus pool to `baseAttributes[key]` per `ATTRIBUTE_KEYS`, then clamps after summing all sources. `source: stats.ts → computeAttributes`
- `edge:` clamp is applied **after** all sources are summed (a +100 manual lands at +7; -100 lands at -7). `ATTRIBUTE_MIN = -7`, `ATTRIBUTE_MAX = 7`.

C2. **No active Archetype → all attributes are zero (before bonuses).** Confirmed by test: `{ strength:0, magic:0, agility:0, luck:0 }`. `source: computeAttributes` (via B5)

C3. **Bonus pool sums six source families.** `accumulatedBonuses` = `sumBonuses(mastery, item, passiveSkill, mechanic, context, manual)`. Built once per derive and shared by attributes/HP/SP so sources are walked once. `source: stats.ts → accumulatedBonuses`
- `edge:` each source helper returns a *full* pool (zeroed for untouched targets: `hp, sp, strength, magic, agility, luck`); the combiner sums per `BONUS_TARGET_KEYS`.

C4. **Mastery bonuses apply only at/above the Mastery Rank, active or not.** `masteryBonuses` iterates **all** owned `archetypes`; an archetype contributes its `mastery` only when `hasMasteryBonus(rank)` (rank ≥ `MASTERY_RANK` = 5). `source: stats.ts → masteryBonuses`
- `edge:` Mastery is derived from Rank, never read from storage — an **inactive** Mastered Archetype still contributes (test: HP Mastery applies while inactive). Below rank 5 → no contribution. Mastery kind maps: `hp`→hp pool, `sp`→sp pool, `attribute`→named attribute pool.

C5. **Item attribute bonuses come only from equipped items' `equip.effects` of `type === "attribute"`.** `itemBonuses` flat-maps equipped item effects; `attributeEffectBonuses` applies only `type === "attribute"` effects (adding `amount` to `pool[target]`). `source: stats.ts → itemBonuses, attributeEffectBonuses`
- `edge:` non-attribute (e.g. affinity) item effects contribute nothing to attributes.

C6. **Passive-skill attribute bonuses come only from active passive skills.** `activePassiveEffects` iterates `activeSkills`, skipping any skill whose `kind !== "passive"`, collecting each passive's `effects ?? []`. Only the `attribute`-type effects then fold into the attribute pool. `source: stats.ts → activePassiveEffects, passiveSkillBonuses`
- `edge:` non-passive active skills (e.g. attack skills) contribute no attribute bonus. A passive with no effects contributes nothing.

C7. **Mechanic attribute bonuses come from the active mechanic's emitted effects.** `activeMechanicEffects` returns `mechanicEffectsFor(kind, state, {stats})` — empty when no mechanic active or the mechanic has no `effects` method (display-only mechanics). Only the attribute-type effects fold into the attribute pool. `source: stats.ts → activeMechanicEffects, mechanicBonuses`

C8. **Context (zone/encounter) attribute bonuses fold in as a sixth source.** `contextBonuses` applies attribute-type effects from `contextEffects`. `source: stats.ts → contextBonuses`
- `edge:` empty `contextEffects` (the standalone sheet) contributes nothing — attributes equal the no-context result.

C9. **Manual bonuses are sparse, missing keys = 0.** `manualBonusPool` reads `manualBonuses[target] ?? 0` per `BONUS_TARGET_KEYS`. `source: stats.ts → manualBonusPool`

C10. **Manual + Mastery do not double-count.** Manual is its own pool summed alongside Mastery; a manual +2 strength on a Mastered Archetype yields base + 2 (not base + 2 + Mastery-as-manual). `source: accumulatedBonuses` (test: "layers manual bonuses on top of derived Mastery without double-counting")

---

## D. Max HP / SP (`stats/stats.ts`)

D1. **Path defines starting HP/SP and per-level gains.** `PATH_STATS`: `health-focused` {24/40, +7/+9}, `balanced` {20/50, +6/+11}, `skill-focused` {16/60, +5/+13}. `source: stats.ts → PATH_STATS, getPathStats`

D2. **Per-path Hit/Skill die sizes.** `PATH_DICE`: `health-focused` {hitDie 12, skillDie 8}, `balanced` {10,10}, `skill-focused` {8,12}. `source: stats.ts → PATH_DICE, getPathDice`
- `edge:` per-level HP figure is the Hit Die average rounded up D&D-style (d12→7, d10→6, d8→5); per-level SP is two Skill Dice averaged (whole: 9/11/13). Encoded as published totals, not re-derived from die size.

D3. **Max HP = startHP + levelsGained × hpPerLevel + hp bonuses, rounded.** `computeMaxHP` = `Math.round(path.startHP + levelsGained(level) * path.hpPerLevel + bonuses.hp)`. `source: stats.ts → computeMaxHP`
- `edge:` `levelsGained(level) = Math.max(0, level - 1)` — level 1 contributes no per-level gain; result is `Math.round`ed (final guard against fractional bonus inputs).

D4. **Max SP = startSP + levelsGained × spPerLevel + sp bonuses, rounded.** Analogous to D3. `source: stats.ts → computeMaxSP`

D5. **HP/SP bonuses come from Mastery + equipment + passive-skill + mechanic + context + manual.** The `bonuses.hp`/`bonuses.sp` lanes of the same accumulated pool. Test confirms summation of Mastery(hp) + equipped item (hp attribute effect) + manual(hp). `source: computeMaxHP / accumulatedBonuses`
- `edge:` Mastery below rank 5 contributes nothing to max HP/SP. SP-kind Mastery and equipped-accessory SP and passive-skill SP all add to max SP.

D6. **Both compute functions accept a pre-built bonus pool.** Optional 2nd arg defaults to `accumulatedBonuses(character)`; threading the shared pool yields identical results. `source: computeMaxHP, computeMaxSP`

---

## E. Hit / Skill Dice (`stats/stats.ts`)

E1. **Max Hit Dice = level + 1.** 2 at level 1, +1 per level (level 30 → 31). Derived from level, never stored. `source: stats.ts → computeMaxHitDice`

E2. **Max Skill Dice = 2 × level + 3.** 5 at level 1, +2 per level (level 30 → 63). Derived from level, never stored. `source: stats.ts → computeMaxSkillDice`

E3. **Only the consumable `*Remaining` pools are tracked**; max dice are always derived. (Documented invariant.) `source: stats.ts`

---

## F. Affinity chart (`stats/stats.ts`)

F1. **Per-type resolution order: override → strongest granted candidate → Archetype base.** `computeAffinityChart` resolves each `DAMAGE_TYPES` entry: an `overrides` entry wins outright; else the strongest candidate granted by equipment/passive-skill/mechanic/context replaces the base; else the Archetype `baseAffinities` value. `source: stats.ts → computeAffinityChart`

F2. **Candidates accumulate from four sources.** Equipment `equip.effects`, active passive-skill effects, active-mechanic effects, and `contextEffects` — each contributes affinity-type effects keyed by their `damageTypes`. `source: computeAffinityChart`

F3. **Collisions resolve by priority, strongest wins.** `AFFINITY_PRIORITY`: drain(5) > repel(4) > null(3) > resist(2) > neutral(1) > weak(0). `strongest()` picks the max. `source: stats.ts → AFFINITY_PRIORITY, strongest`
- `edge:` order-independent — strongest wins whether listed first or last among colliding effects. A single equipment/skill effect replaces the Archetype base regardless of relative priority (a weak-granting item can override a resist base).

F4. **Overrides beat every source, even Drain.** A `{ fire: "weak" }` override wins over a Drain-granting equipped item. `source: computeAffinityChart`

F5. **Almighty and uncharted types default to neutral and have no candidates.** Affinity effects can't target Almighty (absent from `AFFINITY_DAMAGE_TYPES`), so it always falls through to its neutral base — unless explicitly overridden. `source: computeAffinityChart`

F6. **Mechanic-driven affinity is gated by mechanic state.** E.g. Valor grants Slash/Pierce/Strike Resist only at value ≥ 3 (via the mechanic's emitted effects); below 3 those arms stay at base. `source: computeAffinityChart` (test in `stats.test.ts`)

---

## G. Purity invariants (`stats/stats.ts`)

G1. **All stat functions are pure, deterministic, and never mutate inputs.** Repeated calls return equal results; the input `StatContext` is unchanged after computing attributes/HP/SP/affinity. `source: stats.test.ts → "purity"`

---

## H. Leveling (`leveling.ts`)

H1. **Victories-per-level = 7; level ceiling = 30; ranks-per-level = 2.** `VICTORIES_PER_LEVEL = 7`, `MAX_LEVEL = 30`, `ARCHETYPE_RANKS_PER_LEVEL = 2`. `source: leveling.ts`

H2. **`canLevelUp` iff ≥ 7 Victories and level < 30.** `source: leveling.ts → canLevelUp`
- `edge:` false at the cap regardless of banked Victories; false below 7 Victories.

H3. **`applyLevelUp`: +1 level, −7 Victories, +2 saved ranks, dice pools refilled to new-level totals.** Returns `ok` with the new state. `source: leveling.ts → applyLevelUp`
- `edge:` **Victory overflow carries forward** (8 banked → 1 left; 15 → 8) — Victories accumulate past 7. Saved ranks accumulate across multiple level-ups. `hitDiceRemaining`/`skillDiceRemaining` are **set to** the new level's max (`computeMaxHitDice(level)` / `computeMaxSkillDice(level)`), refilling regardless of prior remaining.

H4. **`applyLevelUp` failure modes (no mutation).** Returns `err("max-level")` when already at level 30 (even with banked Victories); `err("insufficient-victories")` when below 7. `max-level` is checked **before** the victory check. `source: applyLevelUp`
- `edge:` reaching cap from level 29 succeeds; the next attempt fails `max-level`. Input is never mutated.

H5. **Max HP/SP is NOT recomputed at level-up.** Only `level` is incremented; max HP/SP is derived from level downstream. `source: leveling.ts` (documented)

---

## I. Spark log & Virtue rank-up (`leveling.ts`)

I1. **Spark log capacity = 7; Virtue rank ceiling = 7.** `SPARK_LOG_CAPACITY = 7`, `MAX_VIRTUE_RANK = 7`. `source: leveling.ts`

I2. **`addSpark` appends the tagged Virtue; rejects when full.** `ok` with the Virtue appended to `sparkLog`; `err("log-full")` once length ≥ 7. `source: leveling.ts → addSpark`
- `edge:` does not mutate input log; fills up to exactly 7.

I3. **`eligibleVirtuesForRankUp` = distinct Virtues of a *full* log.** Returns an empty set below capacity; otherwise `new Set(sparkLog)`. `source: leveling.ts → eligibleVirtuesForRankUp`
- `edge:` rank-up only happens at exactly 7 Sparks — an incomplete log makes nothing eligible.

I4. **`rankUpVirtue`: +1 to the chosen Virtue, clears the log.** Returns `ok` with only the chosen Virtue incremented and `sparkLog: []`. `source: leveling.ts → rankUpVirtue`
- `edge:` failures (no mutation): `err("log-not-full")` when length ≠ 7; `err("virtue-not-eligible")` when the Virtue isn't in the log; `err("rank-capped")` when already at 7 — and on rank-capped the **log is left intact** so another eligible Virtue can be chosen instead of wasting the Sparks. Checked in order: log-not-full → not-eligible → rank-capped.

I5. **`sparkLogBreakdown`: per-Virtue tally, count-desc then `VIRTUE_KEYS` order for ties.** One entry per Virtue appearing ≥ 1×; empty log → empty array. `source: leveling.ts → sparkLogBreakdown`
- `edge:` stable sort over a `VIRTUE_KEYS`-ordered base; ties broken by `VIRTUE_KEYS` order (`expression, empathy, wisdom, focus`).

---

## J. Manual pool adjustments (`adjust-pools.ts`)

J1. **All five adjust functions reject a non-positive amount.** `applyDamage`/`applyHeal`/`applySpendSP`/`applyRecoverSP` return `err("non-positive-amount")` for `amount <= 0`. (Engine accepts a non-negative integer; positive-integer validation lives in the action schema.) `source: adjust-pools.ts`

J2. **`applyDamage`: currentHP − amount, floored at 0.** `Math.max(0, currentHP - amount)`. Fallen is HP ≤ 0. `source: adjust-pools.ts → applyDamage`

J3. **`applyHeal`: currentHP + amount, clamped at maxHP.** `Math.min(maxHP, currentHP + amount)`. `source: adjust-pools.ts → applyHeal`
- `edge:` can revive a Fallen character (heal from 0).

J4. **`applySpendSP`: currentSP − amount, floored at 0.** `source: adjust-pools.ts → applySpendSP`

J5. **`applyRecoverSP`: currentSP + amount, clamped at maxSP.** `source: adjust-pools.ts → applyRecoverSP`

J6. **`applyUsePrisma`: −1 charge; refuses at 0.** `err("no-prisma-charges")` when `prismaCharges <= 0`, else `prismaCharges - 1`. Never drives the column negative. `source: adjust-pools.ts → applyUsePrisma`

---

## K. Currency (`currency.ts`)

K1. **Currency clamps to [0, 99,999,999].** `MAX_CURRENCY = 99_999_999`; `clampCurrency = Math.max(0, Math.min(MAX_CURRENCY, value))`. Shared by action validation, persistence, and optimistic clamp. `source: currency.ts → clampCurrency`

---

## L. Talent resolution (`talents/utils.ts`, `talents/display.ts`)

L1. **Resolved roster = union of `gainedTalents` ∪ active Archetype's talents, deduped, sorted by display name.** `resolveTalents` dedups via `Set`, sorts by `getTalent(key)?.name`. `source: talents/utils.ts → resolveTalents`
- `edge:` only the **active** Archetype contributes (switching swaps the set). Sort uses display *name*, not key. Missing catalog entry → falls back to the **key** as the sort label (and `?.` guards a throw). No active Archetype → just gained talents (sorted). Both empty → `[]`. Unknown active Archetype key → ignored.

L2. **Talents are binary** — the +3 bonus applies once regardless of how many sources grant the same Talent (hence dedup). `source: talents/utils.ts` (documented)

L3. **Sheet talent shaping: inherited chips first (alpha), then gained chips (alpha); `remaining` = canonical talents neither source grants (alpha).** `source: talents/display.ts → resolveTalentsForSheet`
- `edge:` inherited chips marked `inherited: true` (locked/not removable), gained `inherited: false` (removable). Each block alpha by display label; `remaining` drawn from `TALENT_KEYS` minus the known set.

L4. **Builder talent shaping: origin talents in Archetype order (locked); `selectable` = every non-origin canonical talent in `TALENT_KEYS` order.** `source: talents/display.ts → resolveTalentsForBuilder`
- `edge:` order is canonical, not alphabetical. Player-gained picks are NOT excluded from `selectable` (picker keeps them visible).

---

## M. Virtue allocation (creation) (`virtues/utils.ts`)

M1. **Valid creation allocation: exactly one Virtue at 2, exactly two distinct at 1, fourth at 0; no ranks outside {0,1,2}.** `isValidCreationAllocation`. `source: virtues/utils.ts → isValidCreationAllocation`
- `edge:` rejects any rank not in {0,1,2}; requires `twoCount === 1 && oneCount === 2`.

M2. **`coerceVirtueAllocation` narrows raw integers to {0,1,2}, out-of-domain → 0.** `clampVirtueRank(n)` = 1 if n===1, 2 if n===2, else 0. `source: virtues/utils.ts → coerceVirtueAllocation`

M3. **`ZERO_VIRTUE_ALLOCATION` is all-zero across the four Virtues.** `source: virtues/utils.ts`

M4. **`wouldExceedAllocationCap`: true iff setting `key→target` would push past >1 at +2 or >2 at +1.** `source: virtues/utils.ts → wouldExceedAllocationCap`
- `edge:` clearing (`target === 0`) and re-clicking the current rank are never flagged.

M5. **`describeAllocationProgress` reports the +2 Virtue, the +1 Virtues, remaining picks, and validity.** `remaining.plusOnes = Math.max(0, 2 - plusOnes.length)`; `remaining.plusTwo` true when no +2 chosen. `source: virtues/utils.ts → describeAllocationProgress`

---

## N. Reducer orchestration (`reduce-character.ts`)

N1. **The reducer round-trips through the pure engine.** `reduceCharacter(lookups, newId)(character, edit)` = `toRawInputs` → route to the matching slice → `deriveHydratedCharacter` on success; on a slice `null` it returns the **original** character unchanged. `source: reduce-character.ts → reduceCharacter`

N2. **A slice `null` is the single "no-op / engine-rejected → leave unchanged" rule.** Slices never derive; they return next `RawCharacterInputs` or `null`. `source: reduce-character.ts, reduce/shared.ts → SliceResult`

N3. **Edit routing is exhaustive over all `CharacterEdit` kinds.** Grouped `switch` with no default; each group narrows to the slice's sub-union. Adding a new edit kind is a compile error until routed. `source: reduce-character.ts → routeEdit`
- `edge:` routing map — inventory/currency→inventory; ailments/battleConditionAxis/battleConditionFlag/exhaustion/clearCombatState→combat-state; usePrisma/damage/heal/spendSP/recoverSP/cast→pools; valor/perfection/stains/pathOfDawn/pathOfDusk/frenzyPain/frenzyMode→mechanics; victories/addSpark/rankUpVirtue→progression; talentAdd/talentRemove→talents; switchActiveArchetype/setInheritanceSlot/unlockArchetype/rankUpArchetype→archetypes.

N4. **`newId` mints ids for rows an `add`/`unlock` creates.** Injected at the composition root; the server's revalidate later replaces minted ids with persisted rows. `source: reduce-character.ts`

N5. **`patchRow` / `fromResult` helpers.** `patchRow` spreads a `Partial<CharacterRow>` onto the row; `fromResult` applies the patch on `ok` or returns `null` on a `Result` failure. `source: reduce/shared.ts`

---

## O. Pools slice (`reduce/pools.ts`)

O1. **Manual affordances bridge the `adjust-pools` engine through `fromResult`.** `usePrisma`/`damage`/`heal`/`spendSP`/`recoverSP` map to the matching `apply*`; an engine rejection (over-spend → floored value still ok; non-positive → reject; empty flask) becomes a no-op. `source: reduce/pools.ts → reducePoolsEdit`
- `edge:` `heal`/`recoverSP` read the *derived* ceiling (`character.maxHP`/`character.maxSP`) off the hydrated character — clamping at derived max. `damage`/`spendSP`/`usePrisma` read raw row columns. Non-positive amount → null.

O2. **`cast` deducts the resolved Skill cost.** Finds the skill by `edit.skillKey` in `character.skills`, reads its `resolvedCost`, and applies it via `applyResolvedCost` against current HP/SP. `source: reduce/pools.ts`
- `edge:` no-op (`null`) when the skill isn't on the character (`resolvedCost` undefined) OR the character cannot afford the cost. SP-cost skills deduct from SP (HP untouched); HP-cost (incl. %-of-max-HP) skills deduct from HP (SP untouched).

---

## P. Combat-state slice (`reduce/combat-state.ts`)

P1. **`ailments` replaces the entire ailment list.** `patchRow({ ailments: edit.ailments })`. (The app neither caps count nor enforces co-existence — DM's call.) `source: reduce/combat-state.ts`

P2. **`battleConditionAxis` sets one axis, preserving other axes/flags.** Merges `{ [edit.axis]: edit.state }` onto current conditions (falling back to `DEFAULT_BATTLE_CONDITIONS` when none persisted). `source: reduce/combat-state.ts`

P3. **`battleConditionFlag` sets one flag (charged/concentrating), preserving the rest.** Same merge pattern; clearing writes `false`. `source: reduce/combat-state.ts`
- `edge:` when `battleConditions` is null, merges onto the all-neutral `DEFAULT_BATTLE_CONDITIONS` fallback (single-field write, not full-object overwrite from a stale client value — the per-field merge avoids back-to-back-click clobbering).

P4. **`exhaustion` increment clamps at `MAX_EXHAUSTION_LEVEL` (6); decrement floors at 0.** `Math.min(6, x+1)` / `Math.max(0, x-1)`. `source: reduce/combat-state.ts`; `MAX_EXHAUSTION_LEVEL = 6` (levels 0–6). `source: combat/exhaustion.ts`

P5. **`clearCombatState` wipes ailments to `[]` and resets conditions to `DEFAULT_BATTLE_CONDITIONS` (all-neutral, flags false).** `source: reduce/combat-state.ts`

---

## Q. Progression slice (`reduce/progression.ts`)

Q1. **`victories` adjusts by delta, floored at 0.** `Math.max(0, victories + delta)`. `source: reduce/progression.ts`

Q2. **`addSpark` round-trips through the leveling engine; rejects when full.** Projects the spark/virtue columns into a `SparkCharacter`, calls `addSpark`, maps the result back; `null` when the log is full. `source: reduce/progression.ts`
- `edge:` Virtue rank columns are untouched by `addSpark`.

Q3. **`rankUpVirtue` round-trips through the leveling engine; rejects per I4.** Maps result back onto `virtueExpression/Empathy/Wisdom/Focus` + `sparkLog`. `null` when log not full, Virtue not eligible, or rank-capped. `source: reduce/progression.ts`
- `edge:` only the chosen Virtue's column changes; `sparkLog` cleared on success.

Q4. **Spark/virtue column projection mapping.** `sparkCharacter` reads `sparkLog`, `virtueExpression/Empathy/Wisdom/Focus`; `sparkRow` writes them back. `source: reduce/progression.ts`

---

## R. Talents slice (`reduce/talents.ts`)

R1. **`talentAdd` appends a key; no-op if already present.** `null` when `gainedTalents.includes(talentKey)`, else append. `source: reduce/talents.ts`

R2. **`talentRemove` removes the matching key, keeping the rest.** Filters `gainedTalents`. `source: reduce/talents.ts`
- `edge:` removing an absent key leaves the list intact (a no-op clone patch — still returns a patched row, not null).

---

## S. Archetypes slice (`reduce/archetypes.ts`)

S1. **`switchActiveArchetype` patches `activeArchetypeId`.** Single-column patch. `source: reduce/archetypes.ts`

S2. **`setInheritanceSlot` replaces the slot at `slotIndex` on the owning row, preserving other slots.** Filters out the slot at `slotIndex`, appends the new `{slotIndex, sourceCharacterArchetypeId, skillKey}`. `source: reduce/archetypes.ts → reduceInheritanceSlot`
- `edge:` no-op (`null`) when the owning `characterArchetypeId` matches no row. Exactly one slot remains at the target index after replacement. A change on the active Archetype re-threads Combat Skills via the re-derive; a change on an inactive one persists without touching the active skill list.

S3. **`unlockArchetype` appends the Archetype at Rank 1 and spends one Saved Rank.** Minted row: `{ id: newId(), rank: 1, inheritanceSlots: [], mechanicState: null }`; `savedArchetypeRanks -= 1`. `source: reduce/archetypes.ts → reduceUnlockArchetype`
- `edge:` no-op (`null`) when: unknown Archetype key; already owned; `savedArchetypeRanks <= 0`; or unmet prerequisites (`unmetPrerequisites` > 0). These mirror the server guards exactly. Prerequisite owned-ranks only count rows whose key is in the catalog (an owned row outside the catalog doesn't satisfy a prereq).

S4. **`rankUpArchetype` increments one owned row's rank and spends a Saved Rank.** `rank + 1`, `savedArchetypeRanks -= 1`, siblings untouched. `source: reduce/archetypes.ts → reduceRankUpArchetype`
- `edge:` no-op (`null`) when: row unknown; already at `MASTERY_RANK` (5); or `savedArchetypeRanks <= 0`. Crossing rank 5 surfaces Mastery via the re-derive; ranking up the active Archetype re-threads its Combat-tab Skills.

---

## T. Mechanics slice (`reduce/mechanics.ts`)

T1. **Each mechanic edit steps the active Archetype's `mechanicState`, leaving other rows untouched.** `writeMechanic` maps only the active row's `mechanicState`. `source: reduce/mechanics.ts`

T2. **Each branch resolves the active mechanic, coercing null state to `initialState()`, and discriminant-guards the kind.** `activeMechanicState` returns null when no active id, the row is missing; else `{activeId, current}` with `current` = persisted state or the mechanic's initial state. A branch no-ops (`null`) when the resolved mechanic's `kind` doesn't match the edit. `source: reduce/mechanics.ts → activeMechanicState`
- `edge:` no-op (`null`) cases per branch: no active Archetype; active row missing; persisted mechanic kind mismatches edit kind. A first edit on a fresh Archetype starts from the empty/initial state.

T3. **Per-mechanic transitions (delegated to mechanic modules, clamped there):**
- `valor`: `adjustValor(±1)` — clamped to `[0, VALOR_MAX(7)]`. `source: mechanics/knight/valor.ts → adjustValor`
- `perfection`: `adjustPerfection(±1)` clamped to `[0, label-count−1]`; `resetPerfection` → rank 0. `source: mechanics/warrior/perfection.ts`
- `stains`: `setStainSlot(slotIndex, element)` sets one token; `clearStains` → all `null` tokens (length `STAIN_SLOT_COUNT`). `source: mechanics/mage/stains.ts`
- `pathOfDawn` / `pathOfDusk`: `setDawnMode` / `setDuskMode` toggles the boolean. `source: mechanics/healer/path-of-dawn.ts, warlock/path-of-dusk.ts`
- `frenzyPain`: `adjustPain(±1)` clamped to `[0, FRENZY_PAIN_MAX]`; `frenzyMode`: `setFrenzyMode(bool)` toggles. `source: mechanics/berserker/frenzy.ts`

---

## U. Foundation shapes & predicates (`foundation/character/state.ts`)

U1. **`isFallen(currentHP)` = `currentHP <= 0`.** `source: foundation/character/state.ts → isFallen`

U2. **Vocabulary constants** (consumed by the engine): `VIRTUE_KEYS = [expression, empathy, wisdom, focus]`; `PATH_CHOICES = [health-focused, balanced, skill-focused]`; `BATTLE_CONDITION_STATES = [neutral, increased, decreased]`; axes `[attack, defense, hitEvasion]`; flags `[charged, concentrating]`; `DEFAULT_BATTLE_CONDITION_TURNS = 3`. `source: foundation/character/state.ts`

U3. **`DEFAULT_BATTLE_CONDITIONS`** = all axes `neutral`, both flags `false`. `source: foundation/character/state.ts`

U4. **`sparkLogSchema` caps at 7; `manualBonuses` is sparse (all keys optional integers).** `source: foundation/character/state.ts`

U5. **Ailments column is permissive `string[]`** — neither count-capped nor co-existence-enforced (the canonical 12-ailment set lives in data, but the column stays plain strings). `source: foundation/character/state.ts → ailmentsSchema`

---

## Cross-cutting invariants

X1. **Derived values are never persisted.** Attributes, max HP/SP, max Hit/Skill Dice, the affinity chart, the active mechanic, and the resolved talent/skill sets are always recomputed from persisted columns + level. Only consumable pools (`currentHP/SP`, `prismaCharges`, `*DiceRemaining`) and explicit state (`mechanicState`, `sparkLog`, `victories`, `savedArchetypeRanks`, ranks, virtues) are stored.

X2. **Optimistic-frame fidelity.** Because the reducer re-derives through the same `deriveHydratedCharacter` the server uses, and slices mirror server write guards exactly, a client optimistic frame matches what the write will commit (or is a clean no-op).

X3. **Rounding / clamping directions (consolidated):**
- Attributes: clamp `[-7, 7]` after summing.
- Max HP/SP: `Math.round` after summing (per-level HP figures are pre-rounded-up averages).
- Damage / spend SP / use Prisma / exhaustion-decrement / victories: floor at 0.
- Heal / recover SP: clamp at derived max.
- Exhaustion-increment: clamp at 6. Currency: clamp `[0, 99,999,999]`. Virtue rank: cap 7. Spark log: cap 7. Level: cap 30. Archetype rank: cap 5 (Mastery).
- Mechanic counters clamp inside their modules (Valor 0–7, Pain 0–max, Perfection 0–maxrank).
