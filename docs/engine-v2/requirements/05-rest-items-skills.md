# 05 — Rest, Exhaustion, Items/Inventory, Skill Cost & Cast

Requirements inventory for the character-economy engine modules: the three rest
transitions, the exhaustion-level lookup table, the item-mutation engine
(equip/add/quantity/remove/resolve), the inventory reducer slice, and the
skill cost/affordability/cast primitives. This is a **gap-filling pass** —
these modules were missed by the first four extractors. Folds in the exact edge
rules named in `_gaps-from-tests.md` and `_gaps-from-source.md`
(G1-COST-1/2, G1-INV-1..9, G1-REST-1..5, G1-FORM-1/2, G2-EXH-1).

Every requirement is a testable statement of *what the engine guarantees*.
`source:` names the file + function; `edge:` records the load-bearing
floor/round/clamp/comparator/null/no-op detail.

---

## A. Rest

`source:` `engine/combat/rest.ts`. All three functions extend the neutral
`StatContext` into a `RestingCharacter` and **re-derive** max HP / SP / Hit Dice
/ Skill Dice from the hydrated view + `level` (never read from storage). All
three are pure and never mutate their input.

### A1. Full Rest restores all pools to max
Full Rest sets `currentHP → computeMaxHP`, `currentSP → computeMaxSP`,
`hitDiceRemaining → computeMaxHitDice(level)`, `skillDiceRemaining →
computeMaxSkillDice(level)`, and `prismaCharges → prismaMaxCharges`.
- `source:` `applyFullRest`
- `edge:` no failure mode — returns the new state directly (not a `Result`).

### A2. Full Rest reduces Exhaustion by exactly one level, floored at 0
`exhaustion → Math.max(0, exhaustion - 1)`.
- `source:` `applyFullRest`
- `edge:` decrements by **one** only (not zeroed); floor at 0 means a
  rest at exhaustion 0 leaves it 0.

### A3. Partial Rest restores HP to max, spends Skill Dice, adds clamped SP
On success: `currentHP → computeMaxHP` (full, not dice-driven);
`skillDiceRemaining → skillDiceRemaining - skillDiceSpent`;
`currentSP → Math.min(computeMaxSP, currentSP + spRecovered)`.
- `source:` `applyPartialRest`
- `edge:` recovered SP clamped at max SP (`Math.min`). Hit Dice **and**
  Exhaustion are untouched.

### A4. Partial Rest failure matrix
Returns `err("insufficient-skill-dice")` (no mutation) when
`skillDiceSpent < 0` **OR** `skillDiceSpent > skillDiceRemaining`.
- `source:` `applyPartialRest`
- `edge:` succeeds at **exactly** remaining (`spent === remaining`, the `>` is
  strict) and on a zero spend when zero remain (`0 > 0` is false). Negative
  spend fails even though the Zod schema would also reject it (engine-level
  defense in depth).

### A5. Respite adds clamped HP, spends Hit Dice
On success: `currentHP → Math.min(computeMaxHP, currentHP + hpRecovered)`;
`hitDiceRemaining → hitDiceRemaining - hitDiceSpent`.
- `source:` `applyRespite`
- `edge:` recovered HP clamped at max HP (`Math.min`). SP **and** Exhaustion
  are untouched.

### A6. Respite failure matrix
Returns `err("insufficient-hit-dice")` (no mutation) when `hitDiceSpent < 0`
**OR** `hitDiceSpent > hitDiceRemaining`.
- `source:` `applyRespite`
- `edge:` same comparator shape as A4 — succeeds at exactly-remaining and at a
  zero spend with zero remaining; the over-spend boundary is strict `>`.

### A7. Spent dice are not regained until the next Full Rest
Partial Rest / Respite only **decrement** their respective remaining pools;
only Full Rest refills Hit Dice and Skill Dice to max.
- `source:` `rest.ts` (A1 vs A3/A5)

### A8. Rest input schemas accept non-negative integers only
`partialRestInputSchema` (`skillDiceSpent`, `spRecovered`) and
`respiteInputSchema` (`hitDiceSpent`, `hpRecovered`) each require
`z.number().int().nonnegative()`.
- `source:` `partialRestInputSchema`, `respiteInputSchema`
- `edge:` reject a negative value and a non-integer (e.g. `1.5`); accept `0`.

---

## B. Exhaustion

`source:` `engine/combat/exhaustion.ts`.

### B1. `getExhaustionLevel` clamps and truncates before lookup
Returns the canonical entry for the level after
`Math.max(0, Math.min(MAX_EXHAUSTION_LEVEL, Math.trunc(level)))`, with
`MAX_EXHAUSTION_LEVEL = 6`.
- `source:` `getExhaustionLevel`
- `edge:` a level below 0 clamps **up to 0**; above 6 clamps **down to 6**;
  a fractional level is truncated **toward zero** (`Math.trunc`, not floor — so
  `-1.9 → -1 → 0` and `5.9 → 5`) before indexing. A malformed/out-of-range/
  fractional persisted level still returns a defined entry.

### B2. Exhaustion table is 0–6, every entry has a non-empty description
`EXHAUSTION_LEVELS = [0..6]`; `exhaustionLevelSchema` requires
`level` in `[0, 6]` (integer) and `description` non-empty (`.min(1)`).
- `source:` `EXHAUSTION_LEVELS`, `exhaustionLevelSchema`,
  `EXHAUSTION_LEVELS_BY_LEVEL`
- `edge:` schema rejects a level below 0, above 6, and an empty description.

### B3. Levels 1–6 descriptions are placeholders (data TODO, not a code rule)
Level 0 = `"No effects."`; levels 1–6 = `"Placeholder — Exhaustion table
pending in the rulebook."`. Non-empty so the tooltip renders.
- `source:` `EXHAUSTION_LEVELS_BY_LEVEL`
- `edge:` factual note — the rulebook Exhaustion table is unshipped; a v2
  importing these strings inherits placeholders.

---

## C. Item Equip / Unequip

`source:` `engine/items/utils.ts`. All transitions return a fresh array and
never mutate the input. Equip slot is read from the catalog via
`getEquippableItem` (injected `GameData` lookup).

### C1. `equipItem` is a single-slot swap (auto-unequip)
Sets the targeted row `equipped: true` and sets `equipped: false` on **every
other** row whose catalog slot equals the target's slot. Rows in other slots are
untouched. (`G1-INV-1`)
- `source:` `equipItem`
- `edge:` enforces one-equipped-per-slot — a v2 that flips only the target's
  flag leaves two items equipped → double item bonuses.

### C2. `equipItem` failure codes
`item-not-found` when no row has the id; `catalog-item-unknown` when the
target row's `catalogItemKey` no longer resolves to a shipped equippable entry
(slot undeterminable). (`G1-INV-2`)
- `source:` `equipItem`
- `edge:` `catalog-item-unknown` is a hard error, not a silent equip — also
  returned for a non-equippable consumable (its `getEquippableItem` is
  undefined).

### C3. `equipItem` ignores orphaned equipped rows when computing conflicts
A currently-equipped row whose `catalogItemKey` is unshipped (slot `undefined`)
is **not** treated as a same-slot conflict — its `?.equip.slot` is undefined,
never equal to `targetSlot`.
- `source:` `equipItem` (`getEquippableItem(...)?.equip.slot`)
- `edge:` `undefined === targetSlot` is false, so the orphan is left as-is.

### C4. `unequipItem` is idempotent
Sets the matched row `equipped: false`; an already-unequipped row returns an
unchanged copy; other rows untouched. `item-not-found` on a miss. (`G1-INV-3`)
- `source:` `unequipItem`
- `edge:` no-op-but-not-error when the row is already unequipped.

---

## D. Item Stacking & Quantity

`source:` `engine/items/utils.ts`. `stackSize` comes from the catalog item
(`getItem`), defaulting to 1.

### D1. `addItem` stacking algorithm — top-up-then-overflow
For a **stackable** item (`stackSize > 1`): first top up existing rows of the
same `catalogItemKey` up to `stackSize` (`added = Math.min(stackSize - quantity,
remaining)`), then overflow the rest into new rows each capped at `stackSize`
(`Math.min(stackSize, remaining)`). For a **non-stackable** item
(`stackSize === 1`): the top-up loop is a no-op, so it always creates that many
separate single-unit rows. (`G1-INV-4`)
- `source:` `addItem`
- `edge:` top-up loop runs **only** when `stackSize > 1`; per-row capacity is
  `stackSize - row.quantity` (skips full rows, capacity ≤ 0); overflow chains
  multiple new rows when adding beyond one stack from empty. Off-by-one on
  `stackSize - quantity` capacity or the row cap corrupts quantities.

### D2. `addItem` new rows
New rows mint their id from the injected `newId`, are `equipped: false`, and
carry the computed `quantity`.
- `source:` `addItem`
- `edge:` `newId` is the only id seam (server `crypto.randomUUID` or client temp
  id for the optimistic frame).

### D3. `addItem` input validation
`invalid-quantity` when `requestedQuantity` is not an integer **or** `< 1`
(`!Number.isInteger || < 1`); `catalog-item-unknown` when the key doesn't
resolve. (`G1-INV-5`)
- `source:` `addItem`
- `edge:` rejects `0`, `-1`, `1.5`; the catalog check runs before the quantity
  check.

### D4. `setItemQuantity` clamps to `[0, stackSize]` with floor
`clamped = Math.max(0, Math.min(stackSize, Math.floor(quantity)))`; a clamped
value of `0` **drops the row** (no phantom zero-quantity rows); otherwise sets
the target's quantity and leaves other rows unchanged. (`G1-INV-6`)
- `source:` `setItemQuantity`
- `edge:` quantity is **floored** (fractional truncated down); clamped above
  `stackSize`; a negative input clamps to 0 → row removed; `stackSize` defaults
  to **1** when the catalog key is unshipped (so an orphaned/non-stackable row
  clamps to 1). `item-not-found` on a miss.

### D5. `removeItem` removes outright
Removes the row by id even when equipped (structurally unequipping it — the
caller re-derives dependent stats); `item-not-found` when no row matches.
(`G1-INV-7`)
- `source:` `removeItem`
- `edge:` deleting an equipped row drops its bonuses on re-derive.

---

## E. Inventory Resolution (display shaping)

`source:` `engine/items/utils.ts`.

### E1. `resolveInventory` partitions, groups, and sorts
Walks hydrated rows: pushes equippable items to a per-slot grouping
(`weapon`/`armor`/`accessory`), consumables to a separate list. Within each
slot, sorts alphabetically by `item.name` (`localeCompare`). Consumables are
sorted by name too.
- `source:` `resolveInventory`, `filterAndSort`
- `edge:` sort is by resolved catalog **name**, not key.

### E2. `resolveInventory` resolves the equipped item per slot
For each of weapon/armor/accessory, `equipped*` = the first entry in that slot
with `equipped: true`, else `null`.
- `source:` `resolveInventory`
- `edge:` picks the **equipped** entry over list order; `null` when nothing in
  the slot is equipped.

### E3. `resolveInventory` drops unrenderable rows
Drops a row whose catalog `item` failed to resolve (`undefined`), and a row that
is **neither** equippable **nor** consumable (no group to render it in).
- `source:` `resolveInventory`
- `edge:` an item that is neither equippable nor consumable is silently dropped,
  not surfaced ungrouped.

### E4. `getEquippedItem(inventory, slot)` returns the equipped item or null
Returns the first row that is `equipped`, has a resolved `item`, and
`isItemForSlot(item, slot)`; else `null`. A **pure** filter over already-resolved
inventory (no catalog access).
- `source:` `getEquippedItem`
- `edge:` `null` when the only equipped item is a different slot, when the
  same-slot item is unequipped, and when the row's catalog `item` is undefined.
  If persisted state has more than one equipped in a slot, the first match wins.

### E5. Capability traits classify catalog items
`isEquippable` = has an `equip` spec; `isStackable` = `stackSize > 1`;
`isConsumable` = `consumable === true`; `isItemForSlot(item, slot)` =
`item.equip?.slot === slot`.
- `source:` `foundation/items/schema.ts`
- `edge:` traits are **orthogonal** (a weapon is equippable-only; a stackable
  consumable is stackable + consumable, not equippable); `getEquippableItem`
  returns undefined for a consumable.

---

## F. Inventory Reducer Slice

`source:` `engine/character/reduce/inventory.ts` (`reduceInventoryEdit`).

### F1. Currency edit is delta-based and clamped
A `currency` edit patches `currency → clampCurrency(row.currency + edit.delta)`.
(`G1-INV-8`)
- `source:` `reduceInventoryEdit`, `clampCurrency`
- `edge:` the edit is a **delta** added to current (not an absolute set), then
  clamped to `[0, 99_999_999]` (`MAX_CURRENCY`). Add-then-clamp order.

### F2. Inventory-mutation edit routes through the item engine atomically
A non-currency edit projects rows to `InventoryItemState`, runs
`applyInventoryMutation`, and on success re-attaches `characterId` to each row.
- `source:` `reduceInventoryEdit`
- `edge:` projection keeps only `id`/`catalogItemKey`/`equipped`/`quantity`.

### F3. A rejected mutation is a no-op (`null`)
Any `applyInventoryMutation` failure makes the slice return `null` — the whole
inventory edit is atomic and "leaves unchanged" on any engine error. (`G1-INV-9`)
- `source:` `reduceInventoryEdit`
- `edge:` an engine `err` (e.g. unknown row, unshipped add key) → slice `null`,
  never a partial write.

### F4. `applyInventoryMutation` is the mutation router
Routes `equip → equipItem`, `unequip → unequipItem`, `add → addItem` (minting
ids via the injected generator or topping up an existing stack),
`setQuantity → setItemQuantity`, `remove → removeItem`; surfaces the underlying
engine error unchanged (e.g. `catalog-item-unknown` on an unshipped add key).
- `source:` `engine/items/mutate.ts` (`applyInventoryMutation`)
- `edge:` exhaustive `switch` over the closed `InventoryMutation.kind` union; the
  error union is `EquipError | AddError | QuantityError`.

---

## G. Skill Cost Resolution

`source:` `engine/skills/utils.ts`. Authored cost is `{kind:"sp", amount}` or
`{kind:"hp-percent", amount}` (`amount` a positive integer; hp-percent
`max(100)`). Resolved cost is `{kind:"sp"|"hp", amount}`.

### G1. SP cost passes through unchanged
A flat `sp` cost resolves to `{kind:"sp", amount: cost.amount}` verbatim.
- `source:` `resolveCost` / `resolveSkillCost`
- `edge:` no scaling — the authored integer is the resolved amount.

### G2. HP-percent cost resolves against max HP, rounded down, floored at 1
`{kind:"hp", amount: Math.max(1, Math.floor((maxHP * cost.amount) / 100))}`.
(`G1-COST-1`)
- `source:` `resolveCost`
- `edge:` **rounded DOWN** (`Math.floor`), then **floored at 1** — a Skill that
  declares a non-zero `hp-percent` cost never resolves to 0 (never a free cast),
  even at very low max HP. Multiply-before-divide (`maxHP * amount / 100`). A v2
  that rounds up, or drops the floor-at-1, changes the rule.

### G3. Passive skills have no cost
`resolveSkillCost` returns `null` for a skill with no `cost` field (passives).
- `source:` `resolveSkillCost`
- `edge:` `null` means "nothing to pay", distinct from a zero-amount cost
  (which the schema disallows — amounts are positive).

### G4. `resolveCost` resolves against a bare `maxHP`, not the whole character
Takes the resolved `maxHP` number so an enemy statblock (flat maxHP, no
archetype) can resolve a cost too.
- `source:` `resolveCost`, `hydrateSkill`
- `edge:` decoupled from `CastContext`; `hydrateSkill` sets `resolvedCost` for
  cost-bearing skills and `null` for passives.

---

## H. Skill Affordability & Cast

`source:` `engine/skills/utils.ts`. The **load-bearing asymmetry**: SP is
inclusive (`>=`), HP is strict (`>`).

### H1. Affordability — SP inclusive, HP strict (the asymmetry)
`canAfford(cost, pools)`: SP affordable when `currentSP >= amount`; HP
affordable **only** when `currentHP > amount` (strictly greater). (`G1-COST-2`)
- `source:` `canAfford`
- `edge:` an SP skill is affordable at **exactly** the cost (`>=`); an HP skill
  whose cost **equals** `currentHP` is **un**affordable (`>`) — a Skill can
  never drop the caster to 0 HP / self-Fall. Flipping HP to `>=` is a one-char
  rule break.

### H2. `applyResolvedCost` deducts from the matching pool or errors
On affordable: `sp → {...pools, currentSP: currentSP - amount}`;
`hp → {...pools, currentHP: currentHP - amount}`. On unaffordable: `err` with
`"insufficient-sp"` (sp) or `"insufficient-hp"` (hp). (`G1-COST-3`)
- `source:` `applyResolvedCost`
- `edge:` an SP cast **may** drop `currentSP` to exactly 0 (inclusive); an HP
  cast that would drop HP to exactly 0 returns `insufficient-hp` (strict). Pure
  — never mutates the input pools. Deducts only the matching pool.

### H3. `canCast` — passives always castable
`canCast(skill, character)` resolves the cost against `computeMaxHP(character)`;
returns `true` for a costless passive, else `canAfford(cost, character)`.
- `source:` `canCast`
- `edge:` passive → always `true` regardless of current pools.

### H4. `applyCast` — passive returns character unchanged, else deduct
`applyCast` resolves cost against `computeMaxHP`; a costless passive returns
`ok(character)` unchanged; otherwise deducts via `applyResolvedCost` and returns
`ok({...character, ...newPools})` or the `CastError`. (`G1-COST-4`)
- `source:` `applyCast`
- `edge:` engine stays **total** — a passive cast is a no-op success, not an
  error; the UI gates whether a Cast button exists. Pure — never mutates input.

---

## I. Attack-Attribute & Formula Hydration (display)

`source:` `engine/skills/utils.ts`.

### I1. `resolveAttackAttribute` maps a symbol to a concrete score
`st → strength`, `ma → magic`, `ag → agility`, `lu → luck`,
`st-or-ma → Math.max(strength, magic)`.
- `source:` `resolveAttackAttribute`
- `edge:` `st-or-ma` picks the **higher** of Strength and Magic; `lu` (Luck)
  is resolvable (used by Ailment Skills).

### I2. `hydrateFormula` substitutes attribute names with signed scores
Replaces every operator-prefixed attribute name (`±Name`) in a formula with the
resolved signed score, via a **longest-match-first** alternation
(`"St or Ma"` before bare `"St"`/`"Ma"`), global (all occurrences). (`G1-FORM-1`)
- `source:` `hydrateFormula`, `FORMULA_ATTRIBUTE_NAMES`, `FORMULA_PATTERN`
- `edge:` the regex orders `"St or Ma"` first so the bare names don't shadow it;
  matches a leading `+`/`-`/`−` operator + the name (`\b` word boundary); a
  leading `-` renders the score as subtraction; a negative score renders with the
  **Unicode minus** `"− N"`, never `"+ -N"`.

### I3. `formatSignedBonus` signs a number
`value < 0 ? "− {abs}" : "+ {value}"`.
- `source:` `formatSignedBonus`
- `edge:` positives prefixed `+ `; negatives use the **Unicode minus** `−`;
  **zero renders as `"+ 0"`** (positive zero).

---

## Cross-cutting

### X1. No-input-mutation contract
Every function in scope (rest ×3, equip/unequip/add/setQuantity/remove,
resolveInventory, applyResolvedCost, applyCast) returns a fresh value and never
mutates its input.
- `source:` all of `rest.ts`, `items/utils.ts`, `skills/utils.ts`
- `edge:` array transitions return new arrays; pool/character transitions spread
  into new objects.

### X2. Schema-vs-engine defense in depth (factual)
`partialRestInputSchema` / `respiteInputSchema` already forbid negatives, yet
`applyPartialRest` / `applyRespite` re-check `< 0`. Not a bug — the engine is
callable without the schema, so the engine-level guard must be kept.
- `source:` `rest.ts` vs its schemas
