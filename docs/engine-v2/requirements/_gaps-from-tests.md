# Gaps From Tests — Behaviors the Test Suite Proves but the Inventory Misses

A verification pass over every `*.test.ts` under `packages/game/src/engine/**`
(unit, `__integration__`, `__contract__`), cross-referenced against the four
requirement files (`01`–`04`). Each entry is a behavior an engine test asserts
that the inventory does **not** capture (or captures too vaguely to be testable).

Grouped by the inventory's four domains. The biggest finding is **whole modules
the inventory never scopes at all** (the item-mutation engine, the rest engine,
the exhaustion-level table, the Lineage Atlas, the archetype display/preview
surface, the inheritance-source resolver, the map-geometry template reducer, and
several `skills/utils` cost primitives). Those are flagged `genuinely-absent`.

Recall-oriented: false positives are expected; the caller filters. Where the
inventory mentions a function only *in passing* (as a `source:` for some other
item) but never states its own behavior contract, that is flagged
`captured-too-vaguely`.

---

## Domain 1 — Character Derivation & Reducer (file `01`)

### 1a. The rest engine (`combat/rest.ts`) is entirely absent — GENUINE, HIGH PRIORITY

The inventory never mentions `applyFullRest` / `applyPartialRest` /
`applyRespite` or their schemas. This is a whole pure-engine module with rich
clamp/failure behavior. A v2 that drops these silently breaks the rest loop.

- **Full Rest restores HP, SP, Hit Dice, Skill Dice, and Prisma all to max, and reduces Exhaustion by one level (floored at 0).**
  - test: `combat/rest.test.ts` → "Restores HP/SP, Hit/Skill Dice, and Prisma to max", "Reduces Exhaustion by one level", "Floors Exhaustion at zero"
  - why-missed: genuinely-absent (module out of inventory scope)
- **Partial Rest restores HP to max, spends Skill Dice, adds rolled SP clamped at max SP; does NOT restore Hit Dice or reduce Exhaustion.**
  - test: `combat/rest.test.ts` → "Restores HP to max, spends Skill Dice, and adds rolled SP", "Clamps recovered SP at max SP", "Does not restore Hit Dice or reduce Exhaustion"
  - why-missed: genuinely-absent
- **Partial Rest fails when spending more Skill Dice than remaining or a negative spend; succeeds at exactly-remaining and at a zero spend with zero remaining.**
  - test: `combat/rest.test.ts` → "Fails when spending more Skill Dice than remaining", "Fails on a negative Skill Dice spend", "Succeeds when spending exactly the remaining Skill Dice", "Succeeds on a zero spend with zero remaining"
  - why-missed: genuinely-absent
- **Respite adds rolled HP clamped at max HP, spends Hit Dice; does NOT restore SP or reduce Exhaustion; same over-spend/negative/exact/zero failure matrix as Partial Rest.**
  - test: `combat/rest.test.ts` → "Adds rolled HP and spends Hit Dice", "Clamps recovered HP at max HP", "Does not restore SP or reduce Exhaustion", + the four Hit-Dice spend cases
  - why-missed: genuinely-absent
- **`partialRestInputSchema` / `respiteInputSchema` accept non-negative integers, reject negatives and non-integers.**
  - test: `combat/rest.test.ts` → "Accepts non-negative integer inputs", "Rejects a negative value", "Rejects a non-integer value" (both schemas)
  - why-missed: genuinely-absent
- **All three rest functions never mutate their input.**
  - test: `combat/rest.test.ts` → "Does not mutate its input" (×3)
  - why-missed: genuinely-absent

> Note: `MechanicDefinition.resetOn: "rest"` (inventory G6/H*) exists but no MVP
> mechanic uses it, and the inventory never connects rest to the mechanic reset
> path. Worth confirming the rest engine's relationship to `resetOn: "rest"` in v2.

### 1b. The exhaustion-level table (`combat/exhaustion.ts`) is absent — GENUINE

The inventory captures only `MAX_EXHAUSTION_LEVEL = 6` (P4). It never captures
the **lookup table** `getExhaustionLevel` that maps a level to its entry/description.

- **`getExhaustionLevel` returns the entry for an in-range level; clamps below 0 up to 0 and above max down to max; truncates a fractional level toward zero before lookup.**
  - test: `combat/exhaustion.test.ts` → "Returns the entry for an in-range level", "Clamps a level below zero up to zero", "Clamps a level above the maximum down to the maximum", "Truncates a fractional level toward zero before lookup"
  - why-missed: genuinely-absent
- **Every exhaustion level has a non-empty description; `exhaustionLevelSchema` rejects out-of-range levels and empty descriptions.**
  - test: `combat/exhaustion.test.ts` → "Returns a non-empty description for every level", "Accepts every canonical entry", "Rejects a level below zero", "Rejects a level above the maximum", "Rejects an empty description"
  - why-missed: genuinely-absent

### 1c. The item-mutation engine (`items/mutate.ts`, `items/utils.ts`) is absent — GENUINE, HIGH PRIORITY

The inventory mentions `getEquippedItem` (A6) and that "only equipped items feed
stat computation" (A4), but never documents the **inventory write engine** that
the `reduce/inventory` slice routes through. This is a large, behavior-rich
module. The inventory's reducer routing table (N3) says "inventory→inventory"
but never states what the inventory slice/engine does.

- **`applyInventoryMutation` routes equip→equipItem, unequip→unequipItem, add→addItem (minting ids via injected generator OR topping up an existing stack), setQuantity→setItemQuantity, remove→removeItem; surfaces engine errors (e.g. `catalog-item-unknown` on an unshipped add key).**
  - test: `items/mutate.test.ts` → all 7 `it`s
  - why-missed: genuinely-absent
- **`equipItem` auto-unequips the previously-equipped item in the same slot, leaves other slots untouched, returns `item-not-found` / `catalog-item-unknown` (incl. for a non-equippable consumable), ignores orphaned (unshipped) equipped rows when computing slot conflicts, and does not mutate input.**
  - test: `items/utils.test.ts` → "equips the targeted item when its slot is empty", "auto-unequips the previously equipped item in the same slot", "does not touch equipped items in other slots", "returns item-not-found…", "returns catalog-item-unknown…", "returns catalog-item-unknown for a non-equippable consumable", "ignores orphaned currently-equipped rows when computing conflicts", "does not mutate the input array"
  - why-missed: genuinely-absent
- **`unequipItem` is idempotent on an already-unequipped row, leaves others untouched, `item-not-found` on a miss.**
  - test: `items/utils.test.ts` → "unequips an equipped row", "is idempotent when the row is already unequipped", "leaves other equipped rows untouched", "returns item-not-found…"
  - why-missed: genuinely-absent
- **`addItem` stack semantics: a non-stackable item creates one row per unit; a stackable item tops up the existing stack to its `stackSize` before overflowing into new rows, chaining overflow rows when adding beyond one stack from empty; rejects `invalid-quantity` (0, negative, non-integer) and `catalog-item-unknown`.**
  - test: `items/utils.test.ts` → "creates one new row…", "creates separate rows for each unit of a non-stackable item", "stacks a stackable item into one new row", "tops up an existing stackable row before creating a new one", "overflows into a new row once the existing stack is full", "chains overflow rows…", "returns catalog-item-unknown…", "returns invalid-quantity for 0, -1, 1.5"
  - why-missed: genuinely-absent (the round-trip integration test 01 references "adding a stackable consumable tops up the existing stack" but never states the overflow / per-unit / stackSize rules)
- **`setItemQuantity` clamps above `stackSize`, removes the row at 0 or negative (clamped to 0), clamps a non-stackable (or orphaned/unshipped) row to 1, leaves other rows unchanged, `item-not-found` on a miss.**
  - test: `items/utils.test.ts` → "sets a stackable row's quantity", "clamps above stackSize", "removes the row when set to 0", "removes the row when set negative (clamped to 0)", "clamps a non-stackable row to 1", "clamps an orphaned (unshipped) row to a stackSize of 1", "leaves rows other than the target unchanged", "returns item-not-found…"
  - why-missed: genuinely-absent
- **`removeItem` removes by id (structurally unequipping an equipped row), `item-not-found` on a miss.**
  - test: `items/utils.test.ts` → "removes the row by id", "removes an equipped row (structurally unequipping it)", "returns item-not-found…"
  - why-missed: genuinely-absent
- **Capability traits `isEquippable` / `isStackable` / `isConsumable` classify catalog items (weapon = equippable-only; consumable = stackable+consumable, not equippable; `getEquippableItem` returns undefined for a consumable).**
  - test: `items/utils.test.ts` → "classifies an equippable weapon", "classifies the stackable consumable that cannot be equipped"
  - why-missed: genuinely-absent
- **`resolveInventory` groups equippable rows by slot, resolves the per-slot equipped item (picking the equipped one over list order, null when none), sorts within a slot alphabetically by name, collects+sorts consumables, drops rows whose catalog item fails to resolve AND rows that are neither equippable nor consumable.**
  - test: `items/utils.test.ts` → "groups equippable rows by their slot", "carries each row's id, equip state, and quantity onto the entry", "resolves the equipped item per slot", "leaves each equipped slot null when nothing in it is equipped", "picks the equipped accessory rather than the first one in the slot", "sorts entries within a slot alphabetically by name", "collects consumable rows and sorts them by name", "drops rows whose catalog item failed to resolve", "drops rows that are neither equippable nor consumable"
  - why-missed: genuinely-absent (A5 says "full inventory is hydrated for display" but never states the slot-grouping / sort / drop rules of `resolveInventory`)
- **`getEquippedItem(entries, slot)` returns the equipped item of that slot or null (null when only-equipped item is a different slot, ignores unequipped same-slot items, null when catalog item undefined).**
  - test: `items/utils.test.ts` → the 5 `getEquippedItem` `it`s
  - why-missed: captured-too-vaguely (A6 names `getEquippedItem(inventory, "weapon")` but only for weapon selection — never the null/slot-mismatch contract)

### 1d. Skill-cost primitives in `skills/utils.ts` are under-documented — partly GENUINE

The inventory documents `hydrateSkill` (J7), `sortSkillsByKind` (J5),
`resolveAttackAttribute` (C2), and `applyResolvedCost` is *named* in O2. But the
cost-resolution and affordability primitives that O2/the cast path depend on are
never given their own behavior contract.

- **`resolveSkillCost` passes a flat SP cost through unchanged; resolves an HP-percentage cost against max HP, rounding DOWN, floored at 1 (never 0); returns null for a costless passive.**
  - test: `skills/utils.test.ts` → "passes a flat SP cost through unchanged", "resolves an HP-percentage cost against the given max HP", "rounds the HP cost down across varying max HP values", "floors the resolved HP cost at 1, never 0", "returns null for a costless passive Skill"
  - why-missed: genuinely-absent (A7 mentions "%-of-max-HP costs resolve" but never the round-down / floor-at-1 rule)
- **`canAfford` / `canCast`: SP affordable when `currentSP >= amount` (>= , inclusive); HP affordable only when `currentHP > amount` (strict — a Skill can never drop HP to 0); passive always castable regardless of pools.**
  - test: `skills/utils.test.ts` → "approves an SP cost at exactly the amount", "approves an HP cost only when currentHP strictly exceeds the amount", "allows an SP Skill when current SP exactly equals the cost", "rejects an HP Skill when current HP exactly equals the cost", "always allows a costless passive Skill"
  - why-missed: genuinely-absent — the **SP-inclusive vs HP-strict asymmetry** is a load-bearing rule O1/O2 never states
- **`applyResolvedCost` / `applyCast`: deducts SP from SP / HP from HP; returns `insufficient-hp` (incl. when the cost would drop HP to exactly 0) / `insufficient-sp`; an SP cast may drop SP to exactly 0; a passive cast returns the character unchanged; no input mutation.**
  - test: `skills/utils.test.ts` → "refuses to drop HP to 0", "returns insufficient-sp when SP is short", "allows an SP cast at exactly the cost (drops currentSP to 0)", "rejects an HP cast at exactly the cost…", "returns the character unchanged for a costless passive Skill"
  - why-missed: captured-too-vaguely (O2 says "applies via applyResolvedCost" and "cannot afford → no-op" but not the exact error tokens or the HP-to-0 prohibition)
- **`hydrateFormula` substitutes attribute symbols with concrete scores: matches the longer `St or Ma` before short `St`/`Ma`, renders a negative score with the Unicode minus (not `+ -1`), renders a leading minus as subtraction, substitutes ALL occurrences (global), handles `Lu`.**
  - test: `skills/utils.test.ts` → the 6 `hydrateFormula` `it`s
  - why-missed: genuinely-absent (display-formula resolution never mentioned anywhere)
- **`formatSignedBonus` prefixes positives with `+`, uses Unicode minus for negatives, renders zero as `+ 0`.**
  - test: `skills/utils.test.ts` → "prefixes positives with +", "uses a unicode minus for negatives", "renders zero as a positive zero"
  - why-missed: genuinely-absent
- **`resolveAttackAttribute` resolves `lu`→Luck for Ailment Skills (in addition to st/ma/ag/st-or-ma).**
  - test: `skills/utils.test.ts` → "looks up Luck for Ailment Skills"
  - why-missed: captured-too-vaguely (C2 covers st/ma/ag/st-or-ma; the `lu` arm isn't called out)

### 1e. The Lineage Atlas (`archetypes/atlas.ts`) is entirely absent — GENUINE, HIGH PRIORITY

A very large module (1500-line test file) with the growth-surface logic. The
inventory never mentions `buildLineageAtlas`, `atlasNodeState`,
`getAtlasRecommendations`, `unmetPrerequisites`, etc. Note the inventory DOES
reference `unmetPrerequisites` for the *unlock-archetype guard* (S3) but never
documents the Atlas view-builder itself.

- **`unmetPrerequisites(prereqs, ownedMap)` returns [] when the prereq rank is met, the prereq when owned-rank is too low, and the prereq when the parent is unowned.**
  - test: `archetypes/atlas.test.ts` → the 3 `unmetPrerequisites` `it`s
  - why-missed: captured-too-vaguely (S3 cites it but states no contract)
- **`atlasNodeState` returns unlockable (unowned + prereqs met), locked-with-unmet (unowned + gated), owned-with-rank (below mastery 5), or mastered (at 5).**
  - test: `archetypes/atlas.test.ts` → the 4 `atlasNodeState` `it`s
  - why-missed: genuinely-absent
- **`buildLineageAtlas` lists all 12 lineages in canonical order, each with four tier columns (initiate/adept/elite/paragon) in order; places catalog archetypes into their tier column ordered by key; drops hidden archetype keys; marks owned/mastered + bumps a per-lineage progress counter; carries prerequisite parent links; resolves origin lineage from the matching origin row only (null when unknown/unset); ignores owned rows whose key isn't in the catalog.**
  - test: `archetypes/atlas.test.ts` → all 18 `buildLineageAtlas` `it`s
  - why-missed: genuinely-absent
- **`isAtlasNodeUnlocked` treats owned/mastered as unlocked, unlockable/locked as not.**
  - test: `archetypes/atlas.test.ts` → the 4 `isAtlasNodeUnlocked` `it`s
  - why-missed: genuinely-absent
- **`filterAtlasLineagesToUnlocked` keeps only owned/mastered nodes, drops lineages with none, leaves progress counts untouched.**
  - test: `archetypes/atlas.test.ts` → the 3 `filterAtlasLineagesToUnlocked` `it`s
  - why-missed: genuinely-absent
- **`getAtlasRecommendations` fills up to 3 slots: slot 1 from the origin lineage (badged "origin-lineage", preferring lower-tier and rank-up over fresh unlock, tie-broken by key); falls back to path-fit and in-progress off-path lineages; surfaces an off-path lineage teaching a new damage type the character lacks (badged, ranked below on-path); never repeats slot-1, never recommends a locked/mastered node, caps at 3, returns fewer/empty when ineligible; works in planning mode (no saved ranks below the ceiling), nothing at the ceiling.**
  - test: `archetypes/atlas.test.ts` → all `getAtlasRecommendations` `it`s (incl. the UNN-277 new-damage-type block)
  - why-missed: genuinely-absent

### 1f. Archetype display/preview surface (`archetypes/utils.ts`) is absent — GENUINE

The inventory documents the archetype *reducer slice* (S1–S4) and stat-context
*selection* (B1–B7) but not the **display shapers** consumed by sheet+builder.

- **`buildArchetypeEntries` builds one entry per resolvable row (skipping unresolvable keys), flags the active row, resolves rank-keyed + synthesis skills, and produces one resolved inheritance slot per `inheritanceSlots` entry — valid when the source rank still unlocks the slot skill; invalid when the source row is gone or now over-rank; null resolved-skill when the slot's skillKey no longer resolves; an empty (null skillKey) slot is valid with no skill/source.**
  - test: `archetypes/utils.test.ts` → all `buildArchetypeEntries` `it`s; also `archetypes/inheritance.test.ts` → "buildArchetypeEntries inheritance-slot validity" block
  - why-missed: genuinely-absent
- **`buildArchetypeEntries` resolves attack values with no combat context and SCALES a `perPartyLineage` passive by a supplied party composition.**
  - test: `archetypes/utils.test.ts` → "Resolves base attack values with no combat context", "Scales the per-party passive by the supplied composition"
  - why-missed: genuinely-absent
- **`sortArchetypesByPath` leads with the path-matching bucket (health/balanced/skill), ordering balanced+skill ahead of health under skill-focused, tie-broken within a bucket by canonical LINEAGES order; pure, returns a new array.**
  - test: `archetypes/utils.test.ts` → all `sortArchetypesByPath` `it`s
  - why-missed: genuinely-absent
- **`previewArchetypeSkills` returns one ranked skill per declared skill (preserving ranks), drops unresolvable keys, marks a passive's resolvedAttackRoll null, resolves the synthesis skill alongside (or none when undeclared).**
  - test: `archetypes/utils.test.ts` → all `previewArchetypeSkills` `it`s
  - why-missed: genuinely-absent
- **`getArchetypeDisplay` returns the active entry as spotlight, null when none active.**
  - test: `archetypes/utils.test.ts` → "Returns the active archetype entry as the spotlight", "Returns a null spotlight when no row is active"
  - why-missed: genuinely-absent
- **`archetypeSwitcherGroups` groups unlocked rows by lineage in canonical LINEAGES order (skipping unresolvable keys), carrying each option's id/name/tier/current-rank + resolved mechanic display name (null when no mechanic).**
  - test: `archetypes/utils.test.ts` → all `archetypeSwitcherGroups` `it`s
  - why-missed: genuinely-absent

### 1g. Inheritance-source resolution (`archetypes/inheritance.ts`) is absent — GENUINE

The inventory documents the `setInheritanceSlot` *write* (S2) and that inherited
slots feed active skills (B7), but not the resolver that decides what's inheritable.

- **`isInheritableSkill` accepts a rank-keyed skill the source has unlocked; rejects one above the source's current rank, the synthesis skill, and a skill the source doesn't declare.**
  - test: `archetypes/inheritance.test.ts` → the 4 `isInheritableSkill` `it`s
  - why-missed: genuinely-absent
- **`inheritanceSourceGroups` excludes the owner archetype, lists every other unlocked one, offers only in-rank skills, drops a source whose skills are all over-rank, keeps a source with ≥1 in-rank skill.**
  - test: `archetypes/inheritance.test.ts` → the `inheritanceSourceGroups` `it`s
  - why-missed: genuinely-absent

### 1h. Stat-derivation edges the inventory under-states — minor

- **`computeMaxHitDice` / `computeMaxSkillDice` are tied to "rulebook 1.1" (2 Hit / 5 Skill at L1).** Inventory E1/E2 has the formulas but not the rulebook citation — low value, skip unless tracing provenance.
  - test: `character/stats/stats.test.ts` → "Derives 2 Hit / 5 Skill Dice at Level 1 (rulebook 1.1)"
  - why-missed: edge-case-omitted (formula is captured; only the citation isn't)
- **The leveling "rulebook 1.2 canonical example" proves Wisdom/Empathy/Focus eligible and Expression NOT, end-to-end.** Inventory I3/I4 capture the rule; the canonical worked example is extra confidence but not a new behavior.
  - test: `character/leveling.test.ts` → "rulebook 1.2 canonical example" block
  - why-missed: edge-case-omitted (rule captured; example is illustrative)

---

## Domain 2 — Combat Math & Mechanics (file `02`)

This domain is the **most complete**. The combat-math resolvers (attack-roll,
damage-bonus), the mechanics registry + every per-mechanic contract, statblock
derivation, enemy skill hydration, and enemy catalog rows are all faithfully
captured and matched by their tests. Only small edges surfaced:

- **`mechanicStateSchema` round-trip validation per mechanic** (frenzy/stains/dawn/dusk/thiefs-insight/elemental-larceny "produces a state that still validates" / "round-trips through schema"). Inventory G9 captures the discriminated-union-at-the-boundary rule generally; the per-mechanic round-trip assertions are an instance of it.
  - test: e.g. `mechanics/berserker/frenzy.test.ts` → "round-trips through frenzyStateSchema"; `mechanics/mage/stains.test.ts` → "rejects a wrong-length tokens array", "rejects an unknown element"
  - why-missed: captured-too-vaguely (G9 is general; the stains wrong-length/unknown-element rejections specifically are a concrete schema contract worth a line)
- **`initialStateFor` returns a kind-tagged initial state via the registry (e.g. perfection/stains states carry their `kind`).** Inventory G4 captures `initialStateFor` but the "state carries its kind tag" assertion is the testable edge.
  - test: `mechanics/registry.test.ts` → "produces a kind-tagged initial state via the registry"
  - why-missed: edge-case-omitted

No genuine missing behaviors found in this domain's covered modules. Strong.

---

## Domain 3 — Encounter / Combat-Session Tracker (file `03`)

Well covered. The session reducer, map-instance reducer, initiative, fallen,
end-of-turn, occupancy, party composition, enchantment, and the schema all match
their tests. Gaps are in **the map-geometry template reducer**, which the
inventory explicitly scopes OUT (it covers `reduceMapInstance` but defers the
inner `reduceMapGeometry` to "a different extractor"), and a couple of edges.

### 3a. The map-geometry template reducer (`map/reduce-map-geometry.ts`) — GENUINE (but scoped-out by design)

Inventory R22.1 says `editGeometry` delegates to `reduceMapGeometry` "producing
geometry identical to the template reducer" but never documents that reducer's
own contract. If no other inventory file covers `map/`, these are real gaps:

- **`addZone` generates a unique numbered default name, filling the lowest free slot (Zone 1, Zone 3 present → next is Zone 2), not always counting up; result re-parses.**
  - test: `map/reduce-map-geometry.test.ts` → "adds a zone with a unique numbered default name", "fills the lowest free slot rather than always counting up"
  - why-missed: genuinely-absent (module out of inventory scope)
- **`duplicateZone` copies text to a new id+position with a " copy" name suffix, carries over NO connections, no-ops an unknown id.**
  - test: `map/reduce-map-geometry.test.ts` → the `duplicateZone` `it`s
  - why-missed: genuinely-absent (note: `reduceMapInstance` has no duplicateZone path — this is template-only)
- **`renameZone` trims + sets, no-ops empty/whitespace; `setZoneText` patches description and dmNotes independently; `moveZone` updates position; each no-ops an unknown id.**
  - test: `map/reduce-map-geometry.test.ts` → the rename/setText/move `it`s
  - why-missed: genuinely-absent
- **`deleteZone` cascades connections on either endpoint, keeps untouched ones; `addConnection` no-ops self-loop / unknown endpoint / duplicate-in-either-direction; `setConnectionFlag` sets hidden+locked independently; `deleteConnection` removes by id; each no-ops unknown id.**
  - test: `map/reduce-map-geometry.test.ts` → the delete/add/flag connection `it`s
  - why-missed: genuinely-absent

### 3b. Map geometry warnings (`map/geometry-warnings.ts`) — GENUINE

- **`disconnectedZoneIds` returns [] for <2 zones, flags both of two unconnected zones, flags only the isolated one in a mixed graph, [] when every zone has an edge.**
  - test: `map/geometry-warnings.test.ts` → the `disconnectedZoneIds` `it`s
  - why-missed: genuinely-absent
- **`duplicateZoneNames` detects duplicates trimmed + case-insensitively, returning one representative per colliding group, [] when all distinct.**
  - test: `map/geometry-warnings.test.ts` → the `duplicateZoneNames` `it`s
  - why-missed: genuinely-absent

### 3c. Setup-roster placement predicate (`setup-roster-view.ts`) — GENUINE

Inventory file `04` covers `setEngagementTargets`/`normalizeEngagements`/
`engageableTargets` but NOT `isRosterFullyPlaced`.

- **`isRosterFullyPlaced` is true for an unzoned encounter (no zones) and when every combatant sits in an existing zone; false when a combatant is unplaced (or references a now-missing zone) while zones exist.**
  - test: `setup-roster-view.integration.test.ts` → the 4 `isRosterFullyPlaced` `it`s
  - why-missed: genuinely-absent

### 3d. Session-factory schema edges — minor

- **`combatSessionSchema` round-trips through JSON; defaults `moveAvailable`/`standardAvailable` to true for a pre-UNN-310 blob; rejects an unknown side, a non-positive round, a ref missing its discriminant, a non-positive condition duration.**
  - test: `session-factory.integration.test.ts` → "round-trips a representative … session through JSON", "defaults moveAvailable/standardAvailable…", "rejects an unknown side", "rejects a non-positive round", "rejects a combatant ref missing its discriminant", "rejects a non-positive duration"
  - why-missed: captured-too-vaguely (inventory notes the schema floor on vitals but never the session-schema's default-fill + rejection contract; the `moveAvailable` back-compat default is a real migration behavior)

---

## Domain 4 — Views, Redaction & Dungeon (file `04`)

Very well covered — selectors, console/roster/setup-roster views, engagement,
zone graph/layout, reveal/fog, both redaction snapshots, dungeon turn loop, and
dungeon selectors all match their tests. Only minor edges:

- **`combatantDetail` recomputes a placed combatant's move targets through a move (start-zone neighbors before, destination-zone neighbors after) — the UNN-472 case.** Inventory ROS-10 says targets "recomputed through a move" — captured, but the explicit before/after assertion is the proof.
  - test: `roster-view.integration.test.ts` → "combatantDetail — move recomputes adjacent-zone targets (UNN-472)" block
  - why-missed: edge-case-omitted (ROS-10 already states the rule)
- **`buildRosterView` reflects a catalog enemy's ADJUSTED working HP off the ref (not just the full-HP default).** Inventory ROS-5 covers the full-HP default; the "adjusted working HP is reflected" path is the complementary assertion.
  - test: `roster-view.integration.test.ts` → "Reflects catalog enemy's adjusted working HP off ref"
  - why-missed: edge-case-omitted (ROS-5 covers the default; this is the post-adjust read)

No genuine missing behaviors in this domain. Strong.

---

## Cross-cutting / engine composition

### CE-1. `createGameEngine` composition root (`create-engine.ts`) is absent — GENUINE

The inventory describes the deps-first currying convention narratively (CLAUDE.md
+ scattered "deps-first curried" notes) but never states `createGameEngine`'s
testable contract.

- **`createGameEngine` binds exactly the expected set of boundary functions, each callable; defaults `newId` to a real id generator when none is injected; threads an injected `newId` into the id-minting boundary functions.**
  - test: `create-engine.test.ts` → "Binds exactly the expected boundary functions, each callable", "Defaults newId to a real id generator when none is injected", "Threads the injected newId into the id-minting boundary functions"
  - why-missed: genuinely-absent
