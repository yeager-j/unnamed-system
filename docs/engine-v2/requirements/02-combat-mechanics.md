# Combat Math & Mechanics — Requirements Inventory

A testable-behavior inventory of the combat-math modules and the Archetype Mechanics behavior system, extracted from `packages/game/src`. Each item is a behavior a v2 implementation must satisfy. Source paths are relative to `packages/game/src`. This is a pure inventory — no keep/modify/drop opinions, no v2 design.

Scope covered: combat vocabulary (`foundation/combat/**`), the Attack-Roll resolver, the damage-bonus resolver, the Zone-Enchantment effect helper, party-composition derivation, the Mechanics registry + every mechanic module, statblock derivation (PC vs enemy), enemy skill hydration, and enemy catalog view-model shaping.

---

## A. Combat vocabulary & fixed sets

These are closed vocabularies the engine keys off; a v2 must preserve the members and their semantics.

- **A1. Affinity damage types are exactly eleven.** `AFFINITY_DAMAGE_TYPES = [slash, pierce, strike, fire, ice, wind, elec, soul, mind, light, dark]`. These are the only types that appear on an Affinity chart.
  - source: `foundation/combat/affinity.ts`
  - edge: Almighty is intentionally **excluded** from affinity charts — it cannot be resisted.

- **A2. Full damage-type set adds Almighty.** `DAMAGE_TYPES = AFFINITY_DAMAGE_TYPES + ["almighty"]` (twelve total). The affinity chart only keys off the eleven; the full set is what a Skill can deal.
  - source: `foundation/combat/affinity.ts`

- **A3. Affinity values are six.** `AFFINITIES = [weak, resist, null, repel, drain, neutral]`.
  - source: `foundation/combat/affinity.ts`
  - edge: a sparse affinity chart treats an absent damage type as **Neutral**.

- **A4. Delivery values are two.** `DELIVERIES = [physical, magical]` (the "(Magical)"/"(Physical)" parenthetical on a damage type).
  - source: `foundation/combat/attack.ts`

- **A5. Attack attributes are five, including the either-or variant.** `ATTACK_ATTRIBUTES = [st, ma, ag, lu, st-or-ma]`. Labels: st→"Strength", ma→"Magic", ag→"Agility", lu→"Luck", st-or-ma→"Strength or Magic".
  - source: `foundation/combat/attack.ts` (`ATTACK_ATTRIBUTE_LABELS`)

- **A6. Known ranges are six, with an explicit-string escape hatch.** `RANGES = [engaged, all-engaged, same-zone, adjacent-zone, same-or-adjacent-zone, all]`. `rangeSchema` is a discriminated union on `kind`: `"known"` (value ∈ RANGES) or `"explicit"` (non-empty arbitrary string).
  - source: `foundation/combat/attack.ts`

- **A7. Attack-roll tier shape.** A tier has a non-empty free-form `band` string (e.g. `"1-10"`, `"16+"` — boundaries are not fixed by the rulebook), an optional non-empty `formula`, and an **ordered** `sideEffects` array of `SIDE_EFFECT_KEYS`.
  - source: `foundation/combat/attack.ts` (`attackTierSchema`)
  - edge: `sideEffects` ordering is significant (one band may carry several, e.g. Sukunda + Critical). `formula` is optional — Ailment-Skill tiers carry side effects only and compute nothing.

- **A8. Side-effect keys are a closed set of 24.** `[critical, auto-critical, burn, freeze, shock, dizzy, fear, sleep, confuse, despair, rage, brainwash, forget, auto-fear, auto-sleep, auto-confuse, auto-despair, auto-rage, auto-brainwash, auto-forget, insta-kill-light, insta-kill-dark, sukunda, no-cure]`. Auto- variants are distinct keys (no Attribute comparison), not flags.
  - source: `foundation/combat/side-effects.ts`

- **A9. Ailment keys are twelve.** `[downed, burn, freeze, shock, dizzy, forget, sleep, confuse, fear, despair, rage, brainwash]`. `downed` is the only Ailment that can coexist with another. Combat resolution (Technicals, saving throws) is **not** modelled — the app tracks, it does not resolve.
  - source: `foundation/combat/ailments.ts`

- **A10. Counter keys are two.** `COUNTER_KEYS = [lumina, tells]`. Counters are a sparse `key → positive int` map; an absent key ⇒ 0, and a counter driven to 0 drops its key. Per-source caps (Lumina max = caster Luck; Tells max = Thief Rank) are **not enforced** — the app tallies whatever the DM records.
  - source: `foundation/combat/counters.ts`

- **A11. Engagement is a discriminated union.** `{ status: "free" }` or `{ status: "engaged", targetCombatantIds: string[] (≥1) }`. Engagement is symmetric and same-zone (records *who*, never *where*). Records the locked combatant ids only.
  - source: `foundation/combat/engagement.ts`

- **A12. Bonus targets are six.** `BONUS_TARGET_KEYS = [hp, sp, strength, magic, agility, luck]` (the four Attributes plus the two pools).
  - source: `foundation/combat/effects.ts`

---

## B. Effect primitives (the additive modifier vocabulary)

- **B1. Affinity effect** sets a fixed Affinity on ≥1 damage types: `{ type: "affinity", damageTypes: AffinityDamageType[] (≥1), affinity, source? }`.
  - source: `foundation/combat/effects.ts` (`affinityEffectSchema`)

- **B2. Attribute effect** is a flat integer +/- to one bonus target: `{ type: "attribute", target: BonusTargetKey, amount: int, source? }`.
  - source: `foundation/combat/effects.ts` (`attributeEffectSchema`)

- **B3. Attack-roll filter** (`when`) has three optional positive-list axes: `damageTypes`, `deliveries`, `skillKinds` (each ≥1 if present). An omitted axis always matches; multiple axes intersect (all must match); an empty filter matches every Attack Roll.
  - source: `foundation/combat/effects.ts` (`attackRollFilterSchema`)

- **B4. Attack-roll scaler — `perPartyLineage`.** `{ kind: "perPartyLineage", lineage, amount: int, includesSelf: boolean }`. `amount` is per-ally; the resolver multiplies by the party-composition count for `lineage`, subtracting 1 when `includesSelf` is false and the character's active Archetype shares the Lineage. This is the only scaler kind today; `kind` reserves the discriminator.
  - source: `foundation/combat/effects.ts` (`attackRollScalerSchema`)

- **B5. Attack-roll effect** is `{ type: "attackRoll", when?, amount? (int), scaler?, source? }`, with `amount` XOR `scaler` (exactly one must be present — schema-enforced refine).
  - source: `foundation/combat/effects.ts` (`attackRollEffectSchema`)

- **B6. Damage dice** is `{ count: int>0, sides: int>0 }`.
  - source: `foundation/combat/effects.ts` (`damageDiceSchema`)

- **B7. Damage effect** is `{ type: "damage", when?, dice?, amount? (int), source? }`, with `dice` XOR `amount` (exactly one — schema-enforced refine). Damage is display-only (rolled at the table); there is no resolved-damage total.
  - source: `foundation/combat/effects.ts` (`damageEffectSchema`)

- **B8. CombatantEffect union** is the source-agnostic union `Affinity | Attribute | AttackRoll | Damage` effect — the neutral "effect from anywhere" type used by the Zone-Enchantment channel.
  - source: `foundation/combat/effects.ts`

---

## C. Attack-roll resolution

The resolver is **pure**: no I/O, deterministic, never mutates input.

- **C1. Rolling Attribute is always the first source.** The resolved readout's `sources[0]` is the rolling Attribute, labelled via `ATTACK_ATTRIBUTE_LABELS`, **even when its amount is 0 or negative** (so the player sees the base).
  - source: `combat/attack-roll.ts` (`resolveAttackRollFrom`)

- **C2. `st-or-ma` resolves to the max of Strength and Magic.** Other attributes map 1:1 (st→strength, ma→magic, ag→agility, lu→luck).
  - source: `skills/utils.ts` (`resolveAttackAttribute`)

- **C3. Total = rolling Attribute + every matching effect contribution.** Each candidate effect whose `when` filter matches the context contributes its resolved amount to `total`.
  - source: `combat/attack-roll.ts` (`resolveAttackRollFrom`)

- **C4. Effects resolving to 0 are omitted from `sources` and contribute nothing.** Only the rolling Attribute is unconditionally present; a 0-resolving effect produces no source row.
  - source: `combat/attack-roll.ts` (`resolveAttackRollFrom`)
  - edge: a rank-0 Perfection (0 bonus) and a `perPartyLineage` resolving to 0 both produce no source row.

- **C5. An effect with no `source` label is labelled `"Bonus"`.**
  - source: `combat/attack-roll.ts` (`resolveAttackRollFrom`)

- **C6. Contributor collection order is: active mechanic → active passive Skills → context effects.** For the character path, `collectAttackRollEffects` appends in that order, and `sources` preserves it (after the always-first Attribute).
  - source: `combat/attack-roll.ts` (`collectAttackRollEffects`)
  - edge: only the active mechanic contributes (inactive Archetypes' mechanics contribute nothing).

- **C7. Filter axis matching.** A `when` filter matches when, for every present axis, the context value is included in that axis's list. An omitted axis matches. A context whose axis value is `undefined` (e.g. an Ailment Skill has no `damageType`/`delivery`) **fails** any present filter on that axis.
  - source: `combat/attack-roll.ts` (`matchesFilter`, `axisMatches`)
  - edge: `axisMatches` returns false when the candidate is `undefined` regardless of list contents.

- **C8. `perPartyLineage` scaler: amount × lineage count.** Count comes from `partyComposition[lineage]`.
  - source: `combat/attack-roll.ts` (`resolveScaler`)
  - edge: a `null` partyComposition ⇒ count 0 ⇒ contributes 0; a lineage absent from the composition ⇒ 0.

- **C9. `perPartyLineage` self-exclusion.** When `includesSelf` is false **and** the character's `activeLineage` equals the scaler's `lineage`, count is reduced by 1 (floored at 0 via `Math.max(0, count - 1)`).
  - source: `combat/attack-roll.ts` (`resolveScaler`)
  - edge: self is NOT subtracted when there is no active Archetype, when the active Archetype's lineage differs, or when the active Archetype key does not resolve to a lineage.

- **C10. Attack-roll effect amount resolution.** If `amount` is defined, return it; else if `scaler` is defined, resolve it; else 0.
  - source: `combat/attack-roll.ts` (`resolveAmount`)

- **C11. `skillAttackRollContext` derivation.** For an `attack` Skill **with** an `attackRoll` table, returns `{ kind, damageType, delivery, attribute: attackRoll.attribute }`. For an `ailment` Skill, returns `{ kind: "ailment", attribute: attackRoll.attribute }` (no damageType/delivery). Returns `null` for any Skill making no Attack Roll (passive/heal/support, or an attack Skill with no `attackRoll` table).
  - source: `combat/attack-roll.ts` (`skillAttackRollContext`)
  - edge: the ailment arm's *absence* of damageType/delivery is meaningful (tests use `toStrictEqual`).

- **C12. `attackRollEffectsFromSkills` collects only passive Skills' attackRoll effects.** Non-passive Skills are skipped; within a passive, only `attackRoll`-typed effects are collected (other effect types excluded). Shared by the character path and the enemy path.
  - source: `combat/attack-roll.ts` (`attackRollEffectsFromSkills`)

- **C13. Context effects (Zone-Enchantment channel) fold in by source label, applying to every Attack Roll kind.** An unfiltered `attackRoll` context effect applies to an attack Skill and an ailment Skill alike; non-`attackRoll` context effects are ignored by the Attack-Roll resolver.
  - source: `combat/attack-roll.ts` (`collectAttackRollEffects`)

- **C14. Character resolver wiring.** `resolveAttackRoll(context, character, partyComposition)` computes the character's Attributes (`computeAttributes`), collects effects (C6), and resolves scaler amounts against party composition.
  - source: `combat/attack-roll.ts` (`resolveAttackRoll`)

- **C15. Enemy resolver wiring.** Enemies use `resolveAttackRollFrom` with **flat** authored Attributes and a `resolveEffectAmount` of `effect.amount ?? 0` — enemies have no party/Lineage scalers, so a scaler effect resolves to its fixed amount (or 0).
  - source: `engine/enemies/hydrate-enemy-skills.ts`

---

## D. Damage-bonus resolution

Display-only (damage is rolled at the table); no resolved-damage total.

- **D1. Matching damage effects produce labelled bonus lines.** `resolveDamageBonuses(context, character)` folds every `DamageEffect` whose `when` matches the context into `{ source, label }`.
  - source: `combat/damage-bonus.ts` (`resolveDamageBonuses`)

- **D2. Damage-effect contributors are: active mechanic → context effects.** Passive Skills are skipped (the authored skill-effect schema carries no damage effect).
  - source: `combat/damage-bonus.ts` (`collectDamageEffects`)

- **D3. Filter matching reuses the Attack-Roll `matchesFilter`.** Same `when` semantics as C7.
  - source: `combat/damage-bonus.ts` (uses `matchesFilter`)

- **D4. Damage label formatting.** A dice effect formats `"+{count}d{sides}"`. A flat effect formats `"+{amount}"` for ≥0 and `"−{abs(amount)}"` for negative (using the Unicode minus `−`). Missing `source` ⇒ `"Bonus"`.
  - source: `combat/damage-bonus.ts` (`damageLabel`)

- **D5. `foldDamageBonusesIntoFormula` inserts bonuses after the leading damage term, before the Attribute.** Returns the formula unchanged for an empty bonus list. Splits on `" + "`, splices the bonus terms (with leading `+` stripped) at index 1, rejoins on `" + "`. So `"1d10 + St"` + `+3d4` ⇒ `"1d10 + 3d4 + St"`; multiple bonuses fold in order; a flat leading term (`"1 + St"`) and an Attribute-less formula (`"1d6"` ⇒ `"1d6 + 2d4"`) are handled.
  - source: `combat/damage-bonus.ts` (`foldDamageBonusesIntoFormula`)
  - edge: the `+` is stripped from each label because the join supplies the operator; the negative-`−` form is not stripped (only a leading `+` is removed by the regex).

---

## E. Zone Enchantment effects (Bard mechanic behavior)

The Enchantment definitions are engine-owned behavior keyed over the closed `EnchantmentType` union (deliberately not a GameData port).

- **E1. Enchantment types are three.** `ENCHANTMENT_TYPES = [toccata, requiem, tarantella]`. Forte caps at 3 (`MAX_FORTE`), the *f → ff → fff* dynamic-marking ceiling.
  - source: `foundation/combat/enchantment.ts`

- **E2. Only one Zone is Enchanted at a time.** The active Enchantment is a nullable singleton `{ zoneId, type, forte: int 1..3 }` on the session; Enchanting a second Zone overwrites the field. All Enchantments end when combat ends.
  - source: `foundation/combat/enchantment.ts` (`zoneEnchantmentSchema`)

- **E3. `forteMarking` maps a Forte to its notation, clamped.** 1→`"f"`, 2→`"ff"`, 3→`"fff"`; clamps below 1 to `"f"` and above 3 to `"fff"` (`"f".repeat(clamp(forte, 1, MAX_FORTE))`).
  - source: `foundation/combat/enchantment.ts` (`forteMarking`)

- **E4. An Enchantment grants its current Forte's effects and all lower Fortes'.** Definitions encode this directly (e.g. Toccata's Attack-Roll bonus *equals* the Forte). `forteLines[forte-1]` is the per-Forte rule line; a display surface shows the first `forte` entries.
  - source: `engine/encounter/enchantment.ts` (`EnchantmentDefinition`)

- **E5. Toccata effects = a single Attack-Roll bonus equal to the Forte.** `effects(forte)` ⇒ `[{ type: "attackRoll", amount: forte, source: "Toccata" }]`. (Forte-2 "win ties" and Forte-3 "nat 19 → nat 20" are prose-only `forteLines`, not effects.)
  - source: `engine/encounter/enchantment.ts` (`ENCHANTMENTS_BY_TYPE.toccata`)

- **E6. Requiem and Tarantella emit no structured effects.** `effects()` ⇒ `[]` for any Forte; their rules (Requiem's flat damage reduction / no-Technical-Down / no-Weakness-Down; Tarantella's extra Reaction/Move/Standard actions) stay prose-only and DM-adjudicated.
  - source: `engine/encounter/enchantment.ts` (`ENCHANTMENTS_BY_TYPE.requiem`, `.tarantella`)

- **E7. `getEnchantment(type)` is total over the closed union.** Always returns a definition, no miss case.
  - source: `engine/encounter/enchantment.ts` (`getEnchantment`)

- **E8. `zoneEnchantmentEffects(enchantment, zoneId)` confers the active Enchantment's effects only on a combatant in the Enchanted Zone.** Returns `[]` when the enchantment is `null` or when `enchantment.zoneId !== zoneId`; otherwise returns `getEnchantment(type).effects(forte)`.
  - source: `engine/encounter/enchantment.ts` (`zoneEnchantmentEffects`)

---

## F. Party composition derivation

- **F1. `derivePartyComposition(session, side, lineageByCharacterId)` counts PC combatants on a side by Lineage, including the caster.** Iterates combatants; skips those not on `side`; skips non-`pc` refs; resolves each PC's lineage from the injected map; skips a PC with no resolvable lineage; tallies into a sparse map keyed over LINEAGES.
  - source: `engine/encounter/party-composition.ts` (`derivePartyComposition`)
  - edge: the result is sparse; a PC with no active Archetype (no lineage) is omitted; the count **includes** the character itself.

- **F2. `derivePartyCompositionBySide` produces a per-side map.** Runs F1 for every `CombatSide`, so a caller indexes by the combatant's own side.
  - source: `engine/encounter/party-composition.ts` (`derivePartyCompositionBySide`)

---

## G. Mechanics registry

- **G1. Exactly nine MVP mechanics are registered, each exactly once.** By `kind`: `elemental-larceny, enchantment, frenzy, path-of-dawn, path-of-dusk, perfection, stains, thiefs-insight, valor`. (Owning Archetypes: Perfection→Warrior, Valor→Knight, Path of Dawn→Healer, Path of Dusk→Warlock, Stains→Mage, Thief's Insight→Thief, Elemental Larceny→Elemental Thief, Enchantment→Bard, Frenzy→Berserker.)
  - source: `engine/mechanics/registry.ts`, `registry.test.ts`

- **G2. `getMechanic(kind)` returns the definition or `undefined` for an unknown key.**
  - source: `engine/mechanics/registry.ts`
  - edge: unknown key ⇒ `undefined` (callers no-op without try/catch).

- **G3. `getTypedMechanic(kind)` returns the per-state-typed definition** for a caller with a narrowed `MechanicKind` (lookup via `MECHANICS_BY_KIND`).
  - source: `engine/mechanics/registry.ts`

- **G4. `initialStateFor(kind)` returns a kind-tagged initial state, or `undefined` for an unknown key.** Used to coerce a null persisted `mechanicState` into a renderable empty state without persisting one.
  - source: `engine/mechanics/registry.ts`

- **G5. `mechanicEffectsFor(kind, state, ctx)` returns the active mechanic's effects, or `[]`.** Returns `[]` when the mechanic has no `effects` method or the key is unknown.
  - source: `engine/mechanics/registry.ts`

- **G6. Mechanic definition contract.** Each `MechanicDefinition<TState>` carries: `kind` (kebab-case, matches the Archetype's `mechanic` key), `displayName`, `tagline`, `description`, `schema` (Zod validator), `initialState()`, optional `effects(state, ctx)`, optional `transform(state, context)`, and `resetOn: "encounter" | "rest" | "never"`.
  - source: `engine/mechanics/types.ts`

- **G7. Two effect pathways.** `effects` emits additive declarative `MechanicEffect`s (`Affinity | Attribute | AttackRoll | Damage`) through the existing pipeline. `transform` is a wholesale base-rewrite escape hatch returning `Partial<Pick<StatContext, "baseAttributes" | "baseAffinities" | "activeSkills">>` (each returned field **replaces** outright, not merged/stacked). No MVP mechanic uses `transform`.
  - source: `engine/mechanics/types.ts`

- **G8. `MechanicEffectContext` carries `{ stats: StatContext }`.** Mechanics may read it (re-running pure computes) but must not mutate it. (No current mechanic reads it.)
  - source: `engine/mechanics/types.ts`

- **G9. The persisted state union is validated at the JSONB boundary.** `mechanicStateSchema` is a discriminated union on `kind` over all nine state schemas; `ActiveMechanic = { kind, state }` is the active Archetype's mechanic paired with its persisted state (null at the use site when the active Archetype declares no mechanic). Inactive Archetypes' mechanics contribute nothing to derived values.
  - source: `foundation/mechanics/schema.ts`

---

## H. Per-mechanic behavior contracts

### H1. Perfection (Warrior)

- State: `{ kind: "perfection", rank: int 0..4 }` (rank is a 0-based index on the chain D→C→B→A→S).
- `initialState()` ⇒ rank 0 (D). `resetOn: "encounter"`.
- Rank labels: index 0..4 ⇒ `["D","C","B","A","S"]`; `rankLabel(rank)` falls back to `"D"` for an out-of-range index.
- Attack bonus per rank: `[0,1,2,3,4]`; `attackBonusForRank(rank)` falls back to 0 out of range.
- `effects(state)`: emits **nothing** at rank 0 (bonus 0); above D emits one `{ type: "attackRoll", amount: bonusForRank, source: "Perfection ({label})" }`.
- `adjustPerfection(state, delta)`: `rank = clamp(rank + delta, 0, 4)`; pure, returns new state.
- `resetPerfection(state)`: rank → 0 from any rank.
  - source: `engine/mechanics/warrior/perfection.ts`; `foundation/mechanics/schema.ts` (`PERFECTION_MAX_RANK = 4`)
  - edge: clamps at 0 on decrement and 4 on increment.

### H2. Valor (Knight)

- State: `{ kind: "valor", value: int 0..7 }` (`VALOR_MAX = 7`).
- `initialState()` ⇒ value 0. `resetOn: "encounter"`.
- Thresholds `[1,2,3,4,5]` each have documented descriptions (1: opportunity attack 11+ denies Move; 2: enemies save to Disengage; 3: Slash/Pierce/Strike become Resist; 4: no Down on Weakness; 5: opportunity attack 20+ Downs).
- `effects(state)`: emits **nothing** below value 3; at value ≥3 emits one `{ type: "affinity", damageTypes: ["slash","pierce","strike"], affinity: "resist", source: "Valor ({value})" }`. Only the 3+ threshold is engine-visible; the others are narrative.
- `adjustValor(state, delta)`: `value = clamp(value + delta, 0, 7)`; pure.
  - source: `engine/mechanics/knight/valor.ts`; `foundation/mechanics/schema.ts`
  - edge: clamps at 0 / VALOR_MAX; source label reflects the current value (e.g. `"Valor (7)"`).

### H3. Path of Dawn (Healer)

- State: `{ kind: "path-of-dawn", dawnMode: boolean }`.
- `initialState()` ⇒ `dawnMode: false`. `resetOn: "encounter"`.
- **No `effects` method** (display-only in MVP — Lumina/Skill-cast generation tracked at the table).
- `setDawnMode(state, value)`: returns a new state with `dawnMode = value`; pure (does not mutate input); result still validates against the persisted union.
  - source: `engine/mechanics/healer/path-of-dawn.ts`

### H4. Path of Dusk (Warlock)

- State: `{ kind: "path-of-dusk", duskMode: boolean }`.
- `initialState()` ⇒ `duskMode: false`. `resetOn: "encounter"`.
- **No `effects` method** (display-only in MVP).
- `setDuskMode(state, value)`: returns new state with `duskMode = value`; pure; result validates.
  - source: `engine/mechanics/warlock/path-of-dusk.ts`

### H5. Stains (Mage)

- State: `{ kind: "stains", tokens: (StainElement | null)[] of length 4 }`. `STAIN_ELEMENTS = [fire, ice, elec, wind, light]`; `STAIN_SLOT_COUNT = 4`.
- `initialState()` ⇒ four `null` slots. `resetOn: "encounter"`.
- **No `effects` method** (display-only in MVP).
- `setStainSlot(state, slotIndex, element)`: sets one slot to an element (add/replace) or `null` (remove/consume); copies the tokens array; pure.
- `clearStains(state)`: every slot → `null`.
  - source: `engine/mechanics/mage/stains.ts`; `foundation/mechanics/schema.ts`
  - edge: an out-of-range `slotIndex` (`< 0` or `>= 4`) is a **no-op** (returns the input state). Schema rejects a wrong-length tokens array and unknown elements. Slot position is mechanically meaningless (caller picks the slot).

### H6. Frenzy (Berserker)

- State: `{ kind: "frenzy", pain: int 0..5, frenzyMode: boolean }` (`FRENZY_PAIN_MAX = 5`). `FRENZY_DAMAGE_DIE = 4`.
- `initialState()` ⇒ `{ pain: 0, frenzyMode: false }`. `resetOn: "encounter"`.
- `effects(state)`: emits **nothing** unless `frenzyMode && pain > 0`; otherwise emits one `{ type: "damage", when: { deliveries: ["physical"] }, dice: { count: pain, sides: 4 }, source: "Frenzy (Pain {pain})" }` (1d4 per Pain to Physical damage).
- `adjustPain(state, delta)`: `pain = clamp(pain + delta, 0, 5)`; reaching 0 **forces** `frenzyMode = false`; otherwise preserves the current `frenzyMode`. Pure.
- `setFrenzyMode(state, on)`: `frenzyMode = on && pain > 0` — entering requires ≥1 Pain; exiting is always allowed.
  - source: `engine/mechanics/berserker/frenzy.ts`; `foundation/mechanics/schema.ts`
  - edge: clamps Pain at 0/5; cannot enter Frenzy at 0 Pain; decrementing Pain to 0 exits Frenzy.

### H7. Thief's Insight (Thief)

- State: `{ kind: "thiefs-insight" }` (discriminant only — Tells tracked at the table).
- `initialState()` ⇒ `{ kind: "thiefs-insight" }`. `resetOn: "encounter"`.
- **No `effects` method**, no write path (display-only). Rule prose: +1 Attack Roll per Tell on the target; max Tells per enemy = Thief Rank; 2 Tells reveals a Weakness; Suspicion is a transient d12 check.
  - source: `engine/mechanics/thief/thiefs-insight.ts`

### H8. Elemental Larceny (Elemental Thief)

- State: `{ kind: "elemental-larceny" }` (discriminant only).
- `initialState()` ⇒ `{ kind: "elemental-larceny" }`. `resetOn: "encounter"`.
- **No `effects` method**, no write path (display-only). A Thief's-Insight variant: Study learns Tells; Mark spends 2 Tells to plant a Weakness (Fire/Ice/Elec/Wind) the party can exploit.
  - source: `engine/mechanics/thief/elemental-larceny.ts`

### H9. Enchantment (Bard)

- State: `{ kind: "enchantment" }` (discriminant only — the active Enchantment is encounter-scoped on the Map Instance, not the character row).
- `initialState()` ⇒ `{ kind: "enchantment" }`. `resetOn: "encounter"`.
- **No `effects` method**, no write path (display-only here); its computed effects reach sheets through the `CombatContext.zoneEffects` channel via `zoneEnchantmentEffects` (section E).
  - source: `engine/mechanics/bard/enchantment.ts`

---

## I. Statblock derivation (PC vs enemy)

- **I1. `Statblock` is the provenance-neutral resolved sheet.** Fields: `source: "character" | "enemy"`, `name`, `level: number | null`, `attributes`, `maxHP`, `affinities: Partial<Record<DamageType, Affinity>> | null`, `skills: HydratedSkill[]`, `talents: TalentKey[]`, `weaponAttackRoll: ResolvedAttackRoll | null`, `abilities: string | null`.
  - source: `engine/combatant/statblock.ts`

- **I2. `statblockFromCharacter(character)`** projects a `HydratedCharacter`: `source: "character"`, carries the character's name/level/attributes/maxHP/affinityChart/skills/talents/weaponAttackRoll, and `abilities: null`.
  - source: `engine/combatant/statblock.ts`
  - edge: a PC always has a `level` and a full (every-type) affinity chart.

- **I3. `statblockFromEnemy(lookups)(enemy)`** derives a catalog `EnemyDefinition`: `source: "enemy"`, flat authored attributes/maxHP/affinities, skills hydrated via `hydrateEnemySkills`, talents, `weaponAttackRoll: null` (no equipped weapon), and `abilities: enemy.abilities ?? null`.
  - source: `engine/combatant/statblock.ts`
  - edge: enemy affinities are **sparse** (absent type ⇒ Neutral) and may be `null` for a provisional inline enemy with no chart; `level` may be `null` only for a provisional inline enemy.

- **I4. `resolveCatalogEnemyStatblocks(lookups)(combatants)`** builds a `Record<enemyKey, Statblock>` for every catalog-enemy combatant in a roster. Skips non-`catalog-enemy` refs; resolves once per key (dedup); omits a key whose `getEnemy` returns no definition.
  - source: `engine/combatant/statblock.ts`
  - edge: a key resolving to no definition is omitted (caller falls back to the raw key).

---

## J. Enemy skill hydration

- **J1. An enemy's Skills merge two sources: referenced `skillKeys` then `inlineSkills`.** `skillKeys` resolve through `getSkill` (unresolved keys dropped); `inlineSkills` are full Skill objects appended after.
  - source: `engine/enemies/hydrate-enemy-skills.ts`
  - edge: a `skillKey` the lookup can't resolve is dropped; inline Skills hydrate even when `getSkill` always misses.

- **J2. Attack Rolls resolve against the enemy's flat Attributes.** Each Skill with an attack context resolves via `resolveAttackRollFrom(context, enemy.attributes, effects, effect => effect.amount ?? 0)`; a Skill with no attack context gets `resolvedAttackRoll: null`.
  - source: `engine/enemies/hydrate-enemy-skills.ts`
  - edge: a non-attack/passive Skill (no context) ⇒ `null`.

- **J3. The enemy's own passive Attack-Roll effects fold in across both sources.** `attackRollEffectsFromSkills(mergedSkills)` collects passive `attackRoll` effects from referenced + inline Skills; they apply to a sibling attack only when the filter matches.
  - source: `engine/enemies/hydrate-enemy-skills.ts`
  - edge: a passive bonus whose `when` filter the attack misses (e.g. Slash Boost on a wind attack) does not apply.

- **J4. Scaler effects resolve to their fixed amount (or 0) for enemies.** No party/Lineage scalers — `resolveEffectAmount = effect => effect.amount ?? 0`.
  - source: `engine/enemies/hydrate-enemy-skills.ts`

- **J5. The merged list is returned sorted by kind.** `sortSkillsByKind` orders attacks before passives (full order: attack, heal, ailment, support, passive), tie-broken by damage-type rank (DAMAGE_TYPES order) then name. Sorting happens here, not in the renderer.
  - source: `engine/enemies/hydrate-enemy-skills.ts`, `skills/utils.ts` (`sortSkillsByKind`, `SKILL_KIND_DISPLAY_ORDER`)

- **J6. Costs resolve against the enemy's `maxHP` to satisfy the type, but are inert.** Catalog enemies never pay Skill costs (no SP pool); surfaces render with the cost row suppressed.
  - source: `engine/enemies/hydrate-enemy-skills.ts`

- **J7. `hydrateSkill(skill, maxHP, resolvedAttackRoll, resolvedDamageBonuses=[])`** assembles a `HydratedSkill`: cost-bearing kinds get a non-null `resolvedCost` (resolved against maxHP); the passive variant gets `resolvedCost: null`.
  - source: `skills/utils.ts` (`hydrateSkill`)

---

## K. Enemy catalog view-models (browse/filter/group)

- **K1. `EnemyDefinition` shape.** `{ key (slug /^[a-z0-9-]+$/), level: int>0, name, maxHP: int≥0, attributes (unbounded ints), affinities (sparse partial record), skillKeys: string[], inlineSkills?, talents, abilities? }`. The definition carries **no `family` field** — family is derived from directory.
  - source: `foundation/enemies/schema.ts`

- **K2. Enemy families are six.** `ENEMY_FAMILIES = [humanoid, beast, undead, aberration, monstrosity, elemental]`. `getEnemyFamily(key)` resolves a key to its family or `undefined`.
  - source: `foundation/enemies/schema.ts`; `data/enemies/registry.ts` (`getEnemyFamily`)

- **K3. `buildEnemyCatalogRows(lookups)()`** projects one `EnemyCatalogRow` per enemy: `{ key, name, family, level, maxHP, weaknesses }`. `weaknesses` are the affinity-chart entries equal to `"weak"` (Resist and others excluded). Family falls back to `"humanoid"` defensively (unreachable — every key has a family).
  - source: `engine/enemies/catalog-rows.ts` (`buildEnemyCatalogRows`, `weaknessesOf`)
  - edge: an enemy with no Weak affinities ⇒ empty `weaknesses`.

- **K4. `filterEnemyCatalogRows(rows, { search, family })`** filters by case-insensitive trimmed name substring AND family. `family: null` ⇒ all families; an empty/whitespace search matches every row (`includes("")`).
  - source: `engine/enemies/catalog-rows.ts` (`filterEnemyCatalogRows`)
  - edge: search is trimmed and lowercased; family + search intersect (both must match).

- **K5. `groupEnemyRowsByLevel(rows)`** groups by `level` **ascending**, each group's rows sorted by name (`localeCompare`). Every row is preserved and placed in its level group.
  - source: `engine/enemies/catalog-rows.ts` (`groupEnemyRowsByLevel`)

- **K6. `enemyFamilyCounts(rows)`** returns a sparse `Partial<Record<EnemyFamily, number>>`; an absent family ⇒ zero; the counts total the row count.
  - source: `engine/enemies/catalog-rows.ts` (`enemyFamilyCounts`)
