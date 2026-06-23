# Gaps from Source — Adversarial Re-Walk of the Engine

A recall-oriented list of rules, edge-cases, and numeric behaviors found by
re-reading the engine **source** (`packages/game/src/engine/**`, plus a few
`foundation` constants) that the four requirements inventories
(`01`–`04`) do **not** capture, or capture imprecisely. Grouped by the four
domains. The caller filters false positives — when a rule felt borderline, it is
listed.

A whole class of gaps comes from **entire source files no inventory mentions**:
`engine/character/reduce/inventory.ts`, `engine/items/utils.ts`,
`engine/items/mutate.ts`, `engine/combat/rest.ts`, `engine/skills/utils.ts`
(only `hydrateSkill`/`sortSkillsByKind`/`resolveAttackAttribute` are referenced),
`engine/archetypes/{rank,affinity,inheritance,utils,atlas}.ts`,
`engine/map/{reduce-map-geometry,geometry-warnings}.ts`. Where those overlap a
domain, the gaps are filed under it.

---

## Domain 1 — Character Derivation & Reducer

### Inventory mutation engine (entirely missing)

`engine/items/utils.ts` + `engine/items/mutate.ts` + `reduce/inventory.ts` carry
real stacking/clamp math no inventory item covers. (File 01 §O/§P/§S cover
pools/combat-state/archetypes slices but the **inventory** slice is absent.)

- **G1-INV-1 — `equipItem` is a single-slot swap.** Equipping an item unequips
  every *other* item sharing the same `equip.slot`; the targeted item is set
  `equipped: true`. Slot is read from the catalog (`getEquippableItem`).
  `source:` items/utils.ts `equipItem`.
  `risk:` a v2 that just flips one row's flag leaves two weapons equipped → double item bonuses in stat derivation.

- **G1-INV-2 — `equipItem` failure codes.** `item-not-found` (no row) vs
  `catalog-item-unknown` (row's `catalogItemKey` no longer resolves, so slot is
  unknown). The unknown-catalog case is a hard error, **not** a silent equip.
  `source:` items/utils.ts `equipItem`.
  `risk:` v2 might equip an item whose slot it can't determine, breaking one-per-slot.

- **G1-INV-3 — `unequipItem` is idempotent, `item-not-found` only on missing row.**
  `source:` items/utils.ts `unequipItem`.

- **G1-INV-4 — `addItem` stacking algorithm.** For a stackable item
  (`stackSize > 1`): top up existing rows of the same `catalogItemKey` up to
  `stackSize` **first**, then overflow into new rows each capped at `stackSize`.
  For non-stackable (`stackSize === 1`): always create that many separate rows
  (top-up loop is a no-op). New rows are `equipped: false`, id from `newId`.
  `source:` items/utils.ts `addItem`.
  `risk:` v2 getting the top-up-then-overflow order or the per-row cap wrong corrupts quantities; off-by-one on `stackSize - quantity` capacity.

- **G1-INV-5 — `addItem` rejects non-integer / `< 1` quantity** with
  `invalid-quantity`; unknown catalog key → `catalog-item-unknown`.
  `source:` items/utils.ts `addItem`.

- **G1-INV-6 — `setItemQuantity` clamps to `[0, stackSize]` via
  `Math.max(0, Math.min(stackSize, Math.floor(quantity)))`; a clamped 0 deletes
  the row** (no phantom zero-quantity rows). `stackSize` defaults to 1 when the
  catalog key doesn't resolve.
  `source:` items/utils.ts `setItemQuantity`.
  `risk:` v2 leaving a 0-qty row, or not flooring a fractional quantity, or not clamping to stackSize.

- **G1-INV-7 — `removeItem` removes the row outright (even if equipped); errors
  `item-not-found` for an unknown id.** Deleting an equipped row structurally
  unequips (re-derive drops its bonuses).
  `source:` items/utils.ts `removeItem`.

- **G1-INV-8 — Inventory slice currency edit clamps via `clampCurrency` on
  `row.currency + delta`.** Delta-based (not absolute), then `[0, 99,999,999]`.
  `source:` reduce/inventory.ts.
  `risk:` v2 treating the currency edit as absolute, or clamping before adding delta.

- **G1-INV-9 — Any `applyInventoryMutation` failure → slice returns `null`
  (no-op).** The whole inventory edit is atomic: an engine `err` becomes the
  "leave unchanged" contract.
  `source:` reduce/inventory.ts.

### Rest engine (`engine/combat/rest.ts`) — entirely missing

No inventory file mentions Rest. File 01 §X3 lists clamp directions but omits
Rest's. This is a full transition family with non-obvious "what's untouched".

- **G1-REST-1 — Full Rest** sets HP→maxHP, SP→maxSP, Hit & Skill Dice→max,
  `exhaustion = max(0, exhaustion - 1)` (drops **one** level only), Prisma→
  `prismaMaxCharges`. No failure mode.
  `source:` rest.ts `applyFullRest`.
  `risk:` v2 zeroing exhaustion instead of decrementing by one; refilling Prisma to a wrong ceiling.

- **G1-REST-2 — Partial Rest** sets HP→maxHP, spends `skillDiceSpent` Skill
  Dice, adds `spRecovered` to SP **clamped at maxSP**. Hit Dice + Exhaustion
  **untouched**. Fails `insufficient-skill-dice` when `skillDiceSpent < 0` OR
  `> skillDiceRemaining` (no mutation).
  `source:` rest.ts `applyPartialRest`.
  `risk:` v2 missing that Partial Rest restores HP to *full* (not via dice), or not clamping recovered SP.

- **G1-REST-3 — Respite** adds `hpRecovered` to HP **clamped at maxHP**, spends
  `hitDiceSpent` Hit Dice. SP + Exhaustion untouched. Fails
  `insufficient-hit-dice` when `hitDiceSpent < 0` OR `> hitDiceRemaining`.
  `source:` rest.ts `applyRespite`.

- **G1-REST-4 — Spent dice are NOT regained until the next Full Rest.** Partial/
  Respite decrement the remaining pool; only Full Rest refills.
  `source:` rest.ts.

- **G1-REST-5 — Max HP/SP/dice are re-derived inside Rest** (it extends
  `StatContext` and calls `computeMaxHP/SP/HitDice/SkillDice`), never read from
  storage.
  `source:` rest.ts module doc.

### Skill cost & cast affordability (`engine/skills/utils.ts`)

File 01 §O2 covers the *cast slice* but not the underlying cost/affordability
math; file 02 §J7 mentions `hydrateSkill` but not these:

- **G1-COST-1 — HP-percent cost floors at 1.** `resolveCost` for an `hp-percent`
  cost = `Math.max(1, Math.floor((maxHP * amount) / 100))`. A Skill that costs HP
  always charges **≥ 1**, even at very low max HP. SP costs pass through unchanged.
  `source:` skills/utils.ts `resolveCost`.
  `risk:` v2 dropping the floor-at-1 → a percentage Skill becomes free-cast at low HP; or rounding up instead of down.

- **G1-COST-2 — HP affordability is STRICT `>` (not `>=`).** `canAfford` for an
  HP cost requires `currentHP > amount` — a Skill **can never drop the caster to
  0 HP**. SP requires `currentSP >= amount`.
  `source:` skills/utils.ts `canAfford`.
  `risk:` v2 using `>=` for HP would let a caster self-Fall — a real rule, easy to flip.

- **G1-COST-3 — `applyResolvedCost` maps the kind to the right error:**
  `insufficient-sp` vs `insufficient-hp`; deducts only the matching pool.
  `source:` skills/utils.ts `applyResolvedCost`.

- **G1-COST-4 — `applyCast` on a costless (passive) Skill returns the character
  unchanged (`ok`).** The engine stays total; the UI gates whether a Cast button
  exists.
  `source:` skills/utils.ts `applyCast` / `canCast`.

### Formula hydration (`engine/skills/utils.ts`) — missing

- **G1-FORM-1 — `hydrateFormula` substitutes Attribute abbreviations with signed
  scores.** Regex is **longest-match-first** (`"St or Ma"` before bare `"St"`/
  `"Ma"`), matches a leading `+`/`-`/`−` operator + the name, and renders a
  negative score as `"− N"` (Unicode minus) not `"+ -N"`.
  `source:` skills/utils.ts `hydrateFormula`, `FORMULA_ATTRIBUTE_NAMES`, `FORMULA_PATTERN`.
  `risk:` v2 ordering the alternation so `"St"` shadows `"St or Ma"`; double-substituting; wrong sign glyph.

- **G1-FORM-2 — `formatSignedBonus`:** `value < 0 ? "− {abs}" : "+ {value}"`
  (note: 0 → `"+ 0"`). Unicode minus on the negative arm.
  `source:` skills/utils.ts `formatSignedBonus`.

### Affinity base resolution (`engine/archetypes/affinity.ts`) — missing

- **G1-AFF-1 — `resolveAffinity(archetype, damageType)`:** Almighty → `"neutral"`
  unconditionally; any damage type **absent** from the Archetype chart → `"neutral"`
  (`archetype.affinities[damageType] ?? "neutral"`).
  `source:` archetypes/affinity.ts.
  `risk:` v2 keying a sparse chart and returning `undefined` for an uncharted type instead of Neutral; not special-casing Almighty.

### Mastery / rank predicates (`engine/archetypes/rank.ts`)

File 01 §C4/§S4 reference `MASTERY_RANK = 5` but not the predicate boundary:

- **G1-RANK-1 — `hasMasteryBonus(rank) = rank >= 5`** and
  **`hasUnlockedRank(current, required) = current >= required`** — both `>=`,
  not `>`. The single source of the "you have it at Rank N if your Rank ≥ N" rule.
  `source:` archetypes/rank.ts.
  `risk:` off-by-one (`>`) on either gate silently locks rank-5 mastery or rank-N skills.

### Stat derivation numeric details (`engine/character/stats/stats.ts`)

File 01 §C/§D cover much of this; these specifics are not stated precisely:

- **G1-STAT-1 — `strongest` uses `>` so first-listed wins ties** (a no-op for the
  current bijective `AFFINITY_PRIORITY`, but load-bearing if two effects ever map
  to the same priority).
  `source:` stats.ts `strongest`.

- **G1-STAT-2 — A single granted Affinity candidate replaces the Archetype base
  regardless of relative priority** (a `weak`-granting item overrides a `resist`
  base) — base is **not** a candidate in the `strongest` pool; it's only the
  fallback when there are zero candidates.
  `source:` stats.ts `computeAffinityChart`.
  `risk:` v2 folding the base into the candidate set → a weak-granting item could be out-prioritized by the base, the opposite of intended.

- **G1-STAT-3 — `attributeEffectBonuses` applies ONLY `type === "attribute"`
  effects** (affinity/attackRoll/damage effects contribute nothing to the pool);
  shared by item/passive/mechanic/context sources.
  `source:` stats.ts `attributeEffectBonuses`.

- **G1-STAT-4 — `clamp` for attributes is min-of-max-of (`Math.min(max, Math.max(min, v))`),
  applied once after summing all six sources.** (File 01 §C1 states the clamp range; the
  order — sum then clamp — is what matters for the +100 → +7 case.)
  `source:` stats.ts `clamp` / `computeAttributes`.

### Lineage Atlas & recommendations (`engine/archetypes/atlas.ts`) — entirely missing

A large pure view-model surface with prerequisite, tier-order, and
multi-key recommendation sort logic. No inventory file covers it. (Possibly an
intentional scope cut, but flagged for completeness.)

- **G1-ATLAS-1 — `unmetPrerequisites`:** a prereq `{archetype, rank}` is met when
  `(ownedRankByKey.get(key) ?? 0) >= rank`; returns the unmet ones in declaration
  order. Prereq owned-rank counts only catalog-resolvable owned rows.
  `source:` atlas.ts `unmetPrerequisites`.

- **G1-ATLAS-2 — `atlasNodeState`:** owned + `hasMasteryBonus` → `mastered`; owned
  below → `owned`; unowned with unmet prereqs → `locked`; else `unlockable`.
  Owned state wins over prereq check.
  `source:` atlas.ts `atlasNodeState`.

- **G1-ATLAS-3 — `buildLineageAtlas`** filters hidden keys first; groups by
  Lineage; sorts each Lineage's nodes by **key** (not tier — columns re-bucket by
  `ARCHETYPE_TIERS`); `unlockedCount` = owned rows count; `originLineage` resolved
  from `originCharacterArchetypeId`.
  `source:` atlas.ts `buildLineageAtlas`.

- **G1-ATLAS-4 — `getAtlasRecommendations`** returns `[]` when
  `savedRanks === 0 && level >= MAX_LEVEL`; Slot 1 = best Origin-Lineage pick
  (sort: tierRank → actionRank(owned=0 before unlock=1) → key); Slots 2–3 fill by
  `fillPriority` (in-progress=0 → on-Path=1 → new-damage-type=2) → actionRank →
  tierRank → key; no Archetype repeats; fewer than 3 ⇒ shorter list; off-Path
  Lineages adding no new damage type are never surfaced.
  `source:` atlas.ts `getAtlasRecommendations`, `fillPriority`, `actionRank`, `tierRank`.
  `risk:` the multi-key sort tiebreak order is the kind of thing a rewrite reorders silently.

- **G1-ATLAS-5 — `archetypeDamageTypes` skips `"special"` and non-attack Skills;**
  `accessibleDamageTypes` unions over owned/mastered nodes only.
  `source:` atlas.ts.

### Inheritance & archetype display (`engine/archetypes/{inheritance,utils}.ts`) — missing

- **G1-INH-1 — `isInheritableSkill`:** true iff `source.skills` has a ref with
  matching `skill` key whose `rank ≤ sourceRank` (`hasUnlockedRank`). **Synthesis
  Skills are excluded by construction** (they live on `synthesisSkill`, not
  `skills`).
  `source:` archetypes/inheritance.ts.
  `risk:` v2 letting a Synthesis skill be inherited; using `>` for the rank gate.

- **G1-INH-2 — `inheritanceSourceGroups`** drops the owner's own row, drops
  sources with zero available skills.
  `source:` archetypes/inheritance.ts.

- **G1-INH-3 — Resolved inheritance-slot `isValid`:** an empty slot
  (`skillKey === null`) is **always valid**; a configured slot is valid only when
  its source archetype resolves AND `isInheritableSkill(source, sourceRow.rank,
  skillKey)`. Lets the read side flag a slot whose source rank dropped below the
  picked skill rather than silently dropping it.
  `source:` archetypes/utils.ts `buildArchetypeEntries`.

- **G1-INH-4 — `previewArchetypeSkills` resolves at Rank 2, no equipment, no other
  archetypes** (Origin's auto-rank), so the builder preview shows concrete
  `"1 HP"` / `"Attack Roll +2"`.
  `source:` archetypes/utils.ts `previewArchetypeSkills`.

- **G1-INH-5 — `archetypeSwitcherGroups` / `sortArchetypesByPath`** ordering:
  switcher groups by canonical `LINEAGES` order, tier-then-name within; the
  Movement-1 grid rotates buckets by Path
  (`health → balanced → skill`, etc.), canonical Lineage order within a bucket;
  the sort never gates selectability.
  `source:` archetypes/utils.ts.

### Spark / virtue (`engine/character/leveling.ts`)

- **G1-SPARK-1 — `sparkLogBreakdown` sorts count-desc over a `VIRTUE_KEYS`-ordered
  base** (filters then maps in `VIRTUE_KEYS` order, then stable-sorts by count
  desc) — so ties fall back to `VIRTUE_KEYS` order. (File 01 §I5 states this; kept
  here because the *implementation* relies on JS stable sort over a pre-ordered
  base, a subtle dependency a v2 could break by sorting an unordered map.)
  `source:` leveling.ts `sparkLogBreakdown`.

### Resolved-talent sort fallback (`engine/character/talents/utils.ts`)

- **G1-TAL-1 — `resolveTalents` sorts by `getTalent(key)?.name ?? key`** — a
  catalog miss falls back to the **key** as the sort label (and `?.` guards the
  throw). Only the active archetype's talents are unioned with `gainedTalents`,
  deduped.
  `source:` talents/utils.ts `resolveTalents`.
  `risk:` v2 throwing on an unknown talent key instead of falling back to the key string.

---

## Domain 2 — Combat Mechanics

### Attack-roll resolution numeric details (`engine/combat/attack-roll.ts`)

File 02 §C covers most of this well. Two precise points to underline:

- **G2-AR-1 — `resolveScaler` self-exclusion floors at 0:**
  `count = Math.max(0, count - 1)` only when `!includesSelf && activeLineage ===
  scaler.lineage`. (File 02 §C9 states it; the `Math.max(0, …)` floor is the
  load-bearing numeric piece.)
  `source:` attack-roll.ts `resolveScaler`.

- **G2-AR-2 — `axisMatches` returns false for an `undefined` candidate** (an
  Ailment Skill has no `damageType`/`delivery`), so any *present* filter axis on a
  missing context value **fails** the filter. (File 02 §C7 captures this; the
  `candidate !== undefined && includes` order is the exact construct.)
  `source:` attack-roll.ts `axisMatches`.

### Skill-cost resolution (shared with Domain 1)

The HP-percent **floor-at-1** and **strict-`>` HP affordability** (G1-COST-1/2)
also belong to combat math — they govern what an attack/heal Skill costs. They
are not in file 02.

### Exhaustion lookup clamp (`engine/combat/exhaustion.ts`)

- **G2-EXH-1 — `getExhaustionLevel(level)` clamps + truncates:**
  `Math.max(0, Math.min(6, Math.trunc(level)))` then indexes the table — a
  malformed/out-of-range/fractional persisted level still renders a tooltip.
  `source:` combat/exhaustion.ts `getExhaustionLevel`.
  `risk:` v2 indexing the table with a raw (possibly fractional/negative) level → undefined entry.

### Frenzy damage die constant

- **G2-FRENZY-1 — `FRENZY_DAMAGE_DIE` is implicit `4` in the effect** (`sides: 4`
  hardcoded in Frenzy's `effects`). File 02 §H6 mentions `FRENZY_DAMAGE_DIE = 4`
  but verify v2 keeps the die at d4 per Pain and only emits when
  `frenzyMode && pain > 0`.
  `source:` mechanics/berserker/frenzy.ts.

---

## Domain 3 — Encounter / Combat-Session Tracker

File 03 is the most complete inventory. Remaining precision gaps:

- **G3-DRAFT-1 — `nextDraftingSide` alternation uses `actedOn(lead) <=
  actedOn(otherSide)` (ties → lead).** The tiebreak compares **acted counts**,
  and ties go to the lead side. (File 03 SEL-2 / file 04 SEL-2 describe "fewer
  acted goes next, ties → lead" — correct, but the comparison is `<=` on
  *acted-this-round* counts, computed independently of `pending`.)
  `source:` selectors.ts `nextDraftingSide`.
  `risk:` v2 comparing pending counts instead of acted counts, or flipping the `<=` to `<` (tie would go to the wrong side).

- **G3-INIT-1 — `sideInitiative` highest Agility/Luck are each `Math.max` over
  the side independently;** an empty side → both `null`.
  `suggestedSide`: empty-vs-nonempty, then Agility `>`, then Luck `>`, else
  `null`. A negative-Agility side still beats an empty side. (File 03 R3.1–R3.4
  cover the rules; the `Math.max(...spread)` over possibly-many combatants and the
  strict `>` comparisons are the exact constructs.)
  `source:` initiative.ts `sideInitiative` / `suggestedSide`.

- **G3-COND-1 — Same-direction re-apply ADDS to the *remaining* duration:**
  `conditionDurations[axis] = (conditionDurations[axis] ?? 0) + turns`. Flipping
  direction **replaces** with `turns`. `clear` sets `neutral` + deletes the entry.
  (File 03 R8.2/R8.3 describe extend-vs-reset; the `?? 0` base and the
  set-vs-add branch are the exact math.)
  `source:` reduce/conditions.ts.

- **G3-VITALS-1 — `adjustEnemyVitals` floors the incoming value first
  (`Math.max(0, event.value)`), THEN clamps current against a lowered max
  (`Math.min(current, value)`).** For a catalog-enemy `maxHP` set, prior current
  defaults to `ref.currentHP ?? getEnemy(key)?.maxHP ?? 0` before the
  `Math.min`. (File 03 R12.1–R12.3 cover the behavior; the *order* — floor then
  min-against-new-max — and the catalog default chain are the load-bearing parts.)
  `source:` reduce/enemy-vitals.ts.

- **G3-EOT-1 — `ailmentHpDelta` = `Math.floor((maxHP * 10) / 100)`, negative for
  Burn, positive for Sleep, 0 otherwise.** Multiply-before-divide (`*10/100`, not
  `*0.1`) is the exact integer path; floored. (File 03 R14.2 states it; the
  `*10/100` form vs `*0.1` matters for float edge cases.)
  `source:` end-of-turn.ts `ailmentHpDelta`.

- **G3-EOT-2 — `resolveAilmentApply` value clamp is `Math.max(0, Math.min(maxHP,
  currentHP + delta))`** (Burn floors at 0, Sleep caps at maxHP); `apply` is
  `null` when `hp === null` (PC) or `delta === 0`.
  `source:` end-of-turn.ts `resolveAilmentApply`.

- **G3-EOT-3 — `endOfTurnObligations` filters ailments to `key !== "downed" &&
  AILMENT_KEYS.includes(key)`** — a non-canonical ailment string (the column is
  permissive `string[]`) is **dropped** from obligations.
  `source:` end-of-turn.ts `endOfTurnObligations`.
  `risk:` v2 surfacing junk ailment strings, or not excluding `downed`.

- **G3-MAP-1 — `reduceMapGeometry` (template) is a distinct reducer no inventory
  covers** (file 03 §22 covers the *Instance* `editGeometry` that delegates to it,
  but not the template reducer's own rules). Notable specifics:
  - `addZone` default name = lowest unused `"Zone N"` (N≥1) via `nextZoneName`.
  - `duplicateZone` names the copy `"{name} copy"`, no-op on unknown source.
  - `renameZone` trims; **empty trimmed name → no-op** (so Immer returns same ref).
  - `addConnection` no-ops on self-loop, unknown endpoint, OR duplicate
    (undirected, either direction); new connection defaults `hidden:false,
    locked:false`.
  - `deleteZone` cascades all incident connections.
  `source:` map/reduce-map-geometry.ts.
  `risk:` a v2 sharing this core must keep the same no-op-same-ref contract or the canvas's `next === ref` optimization breaks.

- **G3-WARN-1 — Geometry warnings (`engine/map/geometry-warnings.ts`) missing.**
  `disconnectedZoneIds`: empty until ≥2 zones (a lone zone is never flagged), then
  zones with no incident connection. `duplicateZoneNames`: trimmed + lowercased
  comparison, empty names skipped, one representative per colliding group. Both
  are **warnings, never blocks**.
  `source:` map/geometry-warnings.ts.

---

## Domain 4 — Views, Redaction & Dungeon

File 04 is thorough on redaction. Remaining precise/numeric gaps:

- **G4-DUN-1 — Random-encounter reminder guards `turnCounter > 0` before the
  modulo,** so turn 0 never fires even at interval 1. The interval is constrained
  to `{1,2,3,6}` by `randomEncounterIntervalSchema` — the selector itself does
  **not** guard against a 0 interval (would be NaN/divide-by-zero), relying on the
  schema. (File 04 DSEL-3 states the rule; the schema-enforced interval domain is
  an invariant a v2 must preserve to avoid `% 0`.)
  `source:` dungeon/selectors.ts `dungeonReminders`; foundation/dungeon/state.ts `randomEncounterIntervalSchema`.
  `risk:` v2 widening the interval to allow 0 → `% 0` → NaN → reminder never (or always wrongly) fires.

- **G4-DUN-2 — Exhaustion-onset is `turnCounter >= 49 &&
  (turnCounter - 49) % 3 === 0`** with `EXHAUSTION_ONSET_TURN = DUNGEON_DAY_TURNS
  + 1 = 49`, `EXHAUSTION_ONSET_INTERVAL = 3`. Fires 49, 52, 55…; never ≤ 48; once
  per exact threshold. (File 04 DSEL-4 captures this; the derived
  `DUNGEON_DAY_TURNS + 1` and the `(n - onset) % interval` form are the exact
  constructs.)
  `source:` dungeon/selectors.ts; foundation/dungeon/state.ts.

- **G4-NAME-1 — `appendOrdinals` ordinal is per-base-name, 1-based, bare on first
  occurrence (`ordinal === 1 ? name : "{name} {ordinal}"`).** Computed over the
  **session-order** list, then index-aligned back by combatant id. (File 04
  NAME-2/NAME-3 describe it; the `seen.get(name) ?? 0) + 1` counter and the
  bare-first rule are the exact mechanics, shared by setup roster, console, both
  snapshots, and dungeon enemy tokens.)
  `source:` console-view.ts `appendOrdinals` / `combatantDisplayNames`.
  `risk:` a v2 numbering enemies in a different traversal order makes the same enemy carry different numbers across the DM and player views.

- **G4-DRD-1 — Dungeon enemy tokens bucket an off-graph enemy under the empty-zone
  key `""`** (`byZone[occupant?.zoneId ?? ""]`), and `combatEnemyTokensByZone`
  disambiguates names over the **whole session** (`combatantDisplayNames(session,
  {}, …)` with an empty PC map) so enemy numbering matches the DM views.
  `source:` dungeon/player-snapshot.ts `combatEnemyTokensByZone`.
  `risk:` enemies bucketed under `""` only surface if `""` is a revealed zone (it isn't) — i.e. an unplaced enemy is silently dropped from the fog view, which is the intended redaction; a v2 must not accidentally emit the `""` bucket.

- **G4-DRD-2 — `revealedEndpoint` for a known-exit silhouette returns
  `fromZoneId` when it is revealed, else `toZoneId`** — the surfaced endpoint is
  whichever side is revealed; the far id is never emitted. (File 04 DRD-6 states
  the silhouette; the `isZoneRevealed(from) ? from : to` selection is the exact
  construct.)
  `source:` dungeon/player-snapshot.ts `revealedEndpoint`.

- **G4-DRD-3 — Dungeon party tokens drop occupants not in the delve roster**
  (`if (!entry) continue`) — during combat the shared Instance carries enemy
  tokens keyed by combatant id, which must NOT surface as party "Unknown" chips.
  (File 04 DRD-3 states it; flagged because it is a security-critical *drop*, not a
  fallback-to-id.)
  `source:` dungeon/player-snapshot.ts `tokensByRevealedZone`.

---

## Cross-domain: no-op same-ref contract (under-emphasized)

Every Immer-drafted reducer (`reduce-map-geometry`, `reduce-map-instance`,
`reduce-session` slices, `reduce-dungeon`) and the patch-then-rederive character
reducer rely on returning the **same object reference** for a no-op (unknown id,
empty rename, duplicate edge, …). Files 01 §N2 and 03 §R24.1 mention this for
their own reducers; the **template geometry reducer** (G3-MAP-1) shares the
contract and the canvas's `next === ref` short-circuit depends on it.
`risk:` a v2 reducer that always returns a fresh clone breaks every optimistic `===` short-circuit even when behavior is identical.

---

## Contradictions / possibly-buggy observations (factual, not fixed)

1. **`partialRestInputSchema` / `respiteInputSchema` already constrain inputs to
   `nonnegative`, yet `applyPartialRest`/`applyRespite` re-check `< 0`.** Not a
   bug — defense in depth (the engine is callable without the schema) — but a v2
   should keep the engine-level `< 0` guard, not assume the schema ran.
   `source:` rest.ts vs its schemas.

2. **`reduce-character` pools-slice `cast` reads `resolvedCost` off the hydrated
   skill, but cast affordability uses strict-`>` for HP (G1-COST-2).** A Skill
   whose HP cost exactly equals `currentHP` is **unaffordable** (would Fall the
   caster). Worth verifying v2 keeps this asymmetry between SP (`>=`) and HP
   (`>`); it is easy to read as an off-by-one bug but is the intended rule.
   `source:` skills/utils.ts `canAfford`; reduce/pools.ts.

3. **`getExhaustionLevel` clamps to the 0–6 table, but `EXHAUSTION_LEVELS` 1–6
   descriptions are placeholders** ("Exhaustion table pending in the rulebook").
   Not a code bug — data TODO — but a v2 importing these strings inherits
   placeholders.
   `source:` combat/exhaustion.ts.

4. **`dungeonReminders` does no guard against `intervalTurns === 0`** — safe only
   because `randomEncounterIntervalSchema` excludes 0. The selector and schema are
   coupled across the engine/foundation boundary; a v2 that loosens the schema
   reintroduces a `% 0` hazard. (Flagged above as G4-DUN-1.)
   `source:` dungeon/selectors.ts + foundation/dungeon/state.ts.
