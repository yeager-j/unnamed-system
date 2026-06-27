# Annotated Requirements — 01 Character Derivation & Reducer

Classification of every requirement in `requirements/01-character-derivation.md`
against the v2 design (`decision-log.md`, D1–D23 + O1). Verdicts:

- **PRESERVE** — a game rule v2 must reproduce exactly. Maps to the decision/component that gives it a home.
- **SUPERSEDE** — behavior a decision deliberately changes. Cites the D-number + new behavior.
- **GAP** — design is silent or the component model can't express it. One-line note on what's missing.

---

## A. Hydration pipeline (`derive-hydrated-character.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| A1 | PRESERVE | D5/D8 (`resolve`), D2 (pure DI carry-over) | `resolve(entity)` is the pure, I/O-free, deps-first successor to `deriveHydratedCharacter`. |
| A2 | PRESERVE | D8, D15 (golden-master) | Determinism is the property the golden-master parity test asserts. |
| A3 | SUPERSEDE | D8, D11, D16 | The `HydratedCharacter` god-type (row spread + flat derived fields) is replaced by `Entity` (component map) + computed `ResolvedStatblock`. Derived fields move into `resolve` output; persisted columns project into components at load. |
| A4 | PRESERVE | D8 layer 4 (Equipment), O1 Equipment | "Only equipped items feed stats" → the Equipment component's resolve transform must gate on equipped state. |
| A5 | PRESERVE | O1 Equipment, D7 (rendering) | Full inventory for display is a presentation/Equipment concern; resolve gates stats but the component still carries unequipped items. |
| A6 | PRESERVE | D8 layer 1/2 (`weaponAttackRoll` in StatProfile), D22 | `ResolvedStatblock.weaponAttackRoll?` is explicitly in D8; single-equipped-weapon selection + null-when-absent must be reproduced. D22 governs form interaction. |
| A7 | PRESERVE | D8 (`ResolvedStatblock.skills`), D19 | Each resolved skill carrying attack-roll/damage + maxHP threading for %-HP costs is part of resolve's skill output. |
| A8 | PRESERVE | D8 (combat overlay layer / resolve ctx) | `partyComposition` default null off-encounter must survive as a resolve-context input. **Note:** resolve-context inputs (partyComposition, zoneEffects) are not enumerated as a component in O1 — they're ambient args to `resolve`. Adequately covered but verify the resolve signature carries them. |
| A9 | PRESERVE | D8 (combat overlay), O1 (no zone effects off-encounter) | Zone/context effects default empty; combat overlay layer is inert off-encounter. |
| A10 | SUPERSEDE | D11 (relational projection), D3/D16 | `toRawInputs` round-trip is a v1 shape concern. v2's analog is durable-row ⇄ component-map projection (D11) + storing only depletion (D9); no `toRawInputs` inverse over `HydratedCharacter`. The round-trip invariant (derive∘strip = id) PRESERVES as project∘load = id, but the mechanism is superseded. |

---

## B. Stat-context assembly (`stats/stat-character.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| B1 | PRESERVE | O1 StatProfile (derived recipe), D11 (`characterArchetype → StatProfile`) | Active-archetype-by-surrogate-id resolution must be reproduced inside the StatProfile recipe; the active archetype id is an entity/StatProfile fact. |
| B2 | PRESERVE | O1 StatProfile | `activeLineage` from active archetype. |
| B3 | PRESERVE | O1 StatProfile, C4 (Mastery) | Owned-archetype list w/ rank + Mastery descriptor; unknown-key-dropped. |
| B4 | PRESERVE | O1 Equipment | Equipped-key resolution via catalog; unknown dropped. |
| B5 | PRESERVE | D8 layer 1 (base StatProfile) | Base attributes from active archetype, else zeros. |
| B6 | PRESERVE | D8 layer 1 | Base affinity chart from active archetype, else all-neutral. |
| B7 | PRESERVE | D8 layers 1/3/4 + D19 | Active-skill selection (rank-gate + synthesis + inheritance + item grants, deduped) spans base/inheritance/equipment layers. D19 confirms taxonomy + pass-through; dedup must survive. |
| B8 | PRESERVE | D17 (Mechanics registry), O1 Mechanics | Active mechanic resolution incl. `initialState()` fallback. `activeMechanicFor` → mechanic-state resolution in the Mechanics component. |
| B9 | SUPERSEDE | D8 (layered fold), D17 | v1's single wholesale `applyMechanicTransform` (replaces base attrs/affinities/skills after assembly) becomes the D8 fold's form/Arcana layer (layer 2 replaces base wholesale) + mechanic delta layer. Same outcome, generalized into ordered layers; no-op identity preserved as inert layer. |
| B10 | SUPERSEDE | D11, D3 | `toStatContext` (rebuild context from hydrated char) is a v1-shape inverse; superseded by component-map projection. |
| B11 | PRESERVE | D8/D5 (deps-first currying), D2 | Deps-first curried assembly carries over; `contextEffects` default empty. |

---

## C. Attribute derivation (`stats/stats.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| C1 | PRESERVE | D8 (resolve), D18 (deltas) | Displayed attr = base + summed bonuses, **clamp [-7,+7] after summing**. Clamp-after-sum is a precise numeric rule resolve must reproduce; D18 deltas accumulate then the field clamps. |
| C2 | PRESERVE | D8 layer 1 | No active archetype → zero attributes before bonuses. |
| C3 | PRESERVE | D8 fold (six source families), D18 | Bonus pool sums mastery+item+passiveSkill+mechanic+context+manual once. The six families map onto resolve layers (passives/equipment/mechanic deltas/combat overlay + manual). **Note:** "manual bonuses" source family — see C9/GAP note below. |
| C4 | PRESERVE | O1 StatProfile/Mechanics, C4 rule | Mastery applies at rank ≥ 5 **even when archetype inactive**. Critical: this means owned-but-inactive archetypes contribute — resolve must walk all owned archetypes, not just active. StatProfile recipe must retain all owned archetype ranks, not just the active one. |
| C5 | PRESERVE | D8 layer 4 (Equipment) | Item attribute bonuses from equipped `equip.effects` type attribute only. |
| C6 | SUPERSEDE | D46 (supersedes); D8 layer 3/4, D19 | v1 folded attribute bonuses **only** from `kind === "passive"` Skills. **D46:** v2's composed Skill makes `effects` orthogonal to castability, so `skillEffects` folds **every** collected Skill's `effects[]` (passive *and* castable). Sources unchanged — the active-scoped collection (archetype∪equip∪inheritance∪intrinsic, D19); only the `kind`-gate is dropped. |
| C7 | PRESERVE | D8 (mechanic delta layer), D17 | Mechanic attribute bonuses from active mechanic's emitted effects. |
| C8 | PRESERVE | D8 combat overlay, D21 (zone) | Context/zone attribute bonuses as sixth source. |
| C9 | PRESERVE w/ GAP-flag | D8 / O1 | Manual bonuses (sparse, missing=0). **GAP-adjacent:** O1 has no component for `manualBonuses` (v1 `characters.manualBonuses` column / `manual` bonus source). D11 folds child tables into components but manual bonuses aren't a child table; they're a row column with no named component home in O1. Needs a `ManualBonuses` component or explicit StatProfile field. See GAP list. |
| C10 | PRESERVE | D8, D18 | Manual + Mastery don't double-count (separate pools summed). Resolve must keep them as distinct additive layers. |

---

## D. Max HP / SP (`stats/stats.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| D1 | PRESERVE | D8 layer 1 (StatProfile), D13 (level ambient) | PATH_STATS start + per-level gains. Path is a StatProfile/derived-recipe input; level read from `entity.level` (D13). |
| D2 | PRESERVE | D8 layer 1 | Per-path Hit/Skill die sizes + pre-rounded per-level figures. |
| D3 | PRESERVE | D8 (maxHP resolved), D13 | maxHP = startHP + levelsGained×hpPerLevel + bonuses, rounded. `levelsGained = max(0, level-1)`. maxHP is in `ResolvedStatblock`; level ambient per D13. |
| D4 | PRESERVE | D8, D13 | maxSP analogous. |
| D5 | PRESERVE | D8 fold | HP/SP bonuses from same six-source pool. |
| D6 | PRESERVE | D8 (resolve internals) | Shared pre-built bonus pool — an implementation efficiency; resolve should compute the pool once. |

---

## E. Hit / Skill Dice (`stats/stats.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| E1 | PRESERVE | D8/D13 (derived from level) | maxHitDice = level+1. |
| E2 | PRESERVE | D8/D13 | maxSkillDice = 2×level+3. |
| E3 | PRESERVE w/ GAP-flag | D9 (depletion) / O1 | "Only consumable `*Remaining` pools tracked; max derived." **GAP:** O1 has Vitals (`damage`) and SkillPool (`spSpent`) but **no component for Hit Dice / Skill Dice remaining pools**. D9 covers HP/SP depletion only. Dice are a third consumable pool with no v2 home. See GAP list. |

---

## F. Affinity chart (`stats/stats.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| F1 | PRESERVE | D8 (resolve), D18 (override) | Per-type order: override → strongest granted → archetype base. D18 override-vs-delta covers this; resolve must reproduce the precedence. |
| F2 | PRESERVE | D8 layers 3/4/5 | Candidates from equipment/passive/mechanic/context. |
| F3 | PRESERVE | D8/D18 | AFFINITY_PRIORITY (drain5>repel4>null3>resist2>neutral1>weak0), strongest wins, order-independent. Precise ordering rule resolve must reproduce. |
| F4 | PRESERVE | D18 (override beats delta) | Overrides beat every source incl. Drain. |
| F5 | PRESERVE | D8 layer 1 | Almighty/uncharted → neutral, no candidates. |
| F6 | PRESERVE | D17 (mechanic state-gated) | Mechanic-driven affinity gated by mechanic state (Valor ≥3). |

---

## G. Purity invariants

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| G1 | PRESERVE | D2 (pure DI), D8 | All stat functions pure/deterministic/non-mutating. Core v2 carry-over. |

---

## H. Leveling (`leveling.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| H1 | PRESERVE | D6 (reducer), D13 (level column) | Constants: victories/level=7, MAX_LEVEL=30, ranks/level=2. |
| H2 | PRESERVE | D6 | `canLevelUp` iff ≥7 victories & level<30. |
| H3 | PRESERVE | D6, E1/E2 | applyLevelUp: +1 level, −7 victories, +2 ranks, **dice pools refilled to new-level max**. Victory overflow carries. **Note:** dice-refill depends on the dice-remaining pool (E3 GAP) having a home. |
| H4 | PRESERVE | D6 | Failure modes (max-level before victory check); no mutation. |
| H5 | PRESERVE | D8/D9 | maxHP/SP NOT recomputed at level-up — derived downstream. Reinforced by D8 (maxHP always resolved) + D9 (depletion). |

---

## I. Spark log & Virtue rank-up (`leveling.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| I1 | PRESERVE | D6, D11 (durable row state) | SPARK_LOG_CAPACITY=7, MAX_VIRTUE_RANK=7. Spark log + virtue ranks are durable authored state → entity components / columns. |
| I2 | PRESERVE | D6 | addSpark appends, rejects when full. |
| I3 | PRESERVE | D6 | eligibleVirtuesForRankUp = distinct virtues of a full log. |
| I4 | PRESERVE | D6 | rankUpVirtue: +1 chosen, clears log; failure ordering (log-not-full→not-eligible→rank-capped); rank-capped leaves log intact. Precise ordering rule. |
| I5 | PRESERVE | D6 | sparkLogBreakdown tally, count-desc then VIRTUE_KEYS order. |

**Note on I/Q:** Spark log + virtues are durable, slowly-edited state (D11 durable entity). They have no dedicated O1 component — they'd live as entity columns or a progression-style component. Not a GAP per se (D11 says child tables/columns fold into components), but O1 doesn't enumerate a progression component. Flagged as ambiguous below.

---

## J. Manual pool adjustments (`adjust-pools.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| J1 | PRESERVE | D6 (handlers), D10 (operations own bounds) | All five reject non-positive amount. D10: operations own their clamps. |
| J2 | SUPERSEDE | D9/D10 | `applyDamage`: v1 stores `currentHP = max(0, currentHP−amt)`. v2 stores signed `damage`; currentHP derived `max(0, maxHP−damage)`. Floor-at-0 becomes a derived-read floor; damage operation adds to `damage`. Same player-visible result, different model. |
| J3 | SUPERSEDE | D9/D10 | `applyHeal`: v1 clamps currentHP at maxHP. v2: heal floors `damage` at 0 (no overheal) per D10. Revive-from-0 (J3 edge) preserved. |
| J4 | SUPERSEDE | D9 | `applySpendSP`: v2 stores `spSpent`; symmetric to damage. |
| J5 | SUPERSEDE | D9/D10 | `applyRecoverSP`: floors `spSpent` at 0. |
| J6 | PRESERVE w/ GAP-flag | D6 | `applyUsePrisma`: −1 charge, refuse at 0. **GAP:** O1 has no component for `prismaCharges` (a consumable resource distinct from HP/SP). D9 covers HP/SP depletion only; Prisma is a separate counted pool. Could live in `Counters` (O1) but that's undeclared — see GAP list. |

---

## K. Currency (`currency.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| K1 | PRESERVE w/ GAP-flag | D6 / O1 | Currency clamp [0, 99,999,999]. **GAP:** no O1 component for currency. Durable scalar state with no home (not Counters-shaped semantically, though could go there). See GAP list. |

---

## L. Talent resolution

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| L1 | PRESERVE | D8/D19 (resolved output), O1 StatProfile | Resolved roster = gainedTalents ∪ active archetype talents, deduped, sorted by display name. Resolved output of resolve, like passive skills (D19). **Note:** `gainedTalents` (authored) needs a component home — analogous to C9 manual / talents authored column. Talents not in O1 catalog. |
| L2 | PRESERVE | D8/D19 | Talents binary, +3 once (dedup). |
| L3 | PRESERVE | D7 (rendering), D8 | Sheet talent shaping (inherited-first, gained, remaining). Display shaping — D7 capability→widget; ordering rules preserved. |
| L4 | PRESERVE | D7, D8 | Builder talent shaping (origin in archetype order, selectable in TALENT_KEYS order). |

**Note:** Talents (`gainedTalents`) authored state has no named O1 component. Like manual bonuses / spark log, folds under D11 as a column/component but O1 silent. Flagged ambiguous.

---

## M. Virtue allocation (creation)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| M1 | PRESERVE w/ scope-note | D6 / (builder) | Creation allocation validation. **Note:** this is **builder/creation-flow** logic. D11 says the builder writes component edits, and D14/D15 scope the inventory to engine behavior. Virtue-allocation validation is engine-pure utility but lives at the creation boundary; v2 design does not explicitly address the builder. Preserve, but builder coverage is thin in D1–D23. |
| M2 | PRESERVE | D6 | coerceVirtueAllocation narrows to {0,1,2}. |
| M3 | PRESERVE | D6 | ZERO_VIRTUE_ALLOCATION. |
| M4 | PRESERVE | D6 | wouldExceedAllocationCap. |
| M5 | PRESERVE | D6 | describeAllocationProgress. |

---

## N. Reducer orchestration (`reduce-character.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| N1 | SUPERSEDE | D6, D8 | v1: `toRawInputs → slice → deriveHydratedCharacter`. v2: reducer switches on event, handlers mutate component map, `resolve` re-derives. Round-trip-through-pure-engine preserved as a property; the `toRawInputs`/`HydratedCharacter` mechanism superseded. |
| N2 | PRESERVE | D6 | Slice-null = no-op/leave-unchanged. Reducer-validated-no-op carries (D6: "validated no-op"). |
| N3 | PRESERVE | D6 (exhaustive switch) | Exhaustive routing, no default, compile-error on new kind. Directly D6's exhaustive-switch-on-event style. |
| N4 | PRESERVE | D6, D16 | `newId` mints ids for created rows. Still needed for component-creating edits. |
| N5 | SUPERSEDE | D6, D16 | `patchRow`/`fromResult` over `Partial<CharacterRow>` → component-map patch helpers over `Partial<ComponentRegistry>`. Same role, component vocabulary. |

---

## O. Pools slice (`reduce/pools.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| O1 | SUPERSEDE | D9/D10 | Manual affordances bridge adjust-pools. v2: same handlers over depletion model. **Edge preserved:** heal/recoverSP read *derived* ceiling (maxHP/maxSP from resolve) — D9 makes this automatic (ceiling resolved). |
| O2 | PRESERVE | D6, D8 (resolvedCost), D14 | `cast` deducts resolved skill cost. D14 explicitly preserves cost comparators: **strict `>` HP, `>=` SP, %HP = max(1, floor(maxHP*amt/100))**. Critical PRESERVE called out in D14. |

---

## P. Combat-state slice (`reduce/combat-state.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| P1 | PRESERVE | O1 Ailments (overlay), D6 | ailments replaces entire list; no cap/co-existence. Ailments overlay component. |
| P2 | PRESERVE | O1 BattleConditions (overlay), D6 | battleConditionAxis sets one axis, preserves rest. |
| P3 | PRESERVE | O1 BattleConditions, D6 | battleConditionFlag (charged/concentrating) per-field merge. The UNN-226 per-field-merge discipline must carry. |
| P4 | PRESERVE | O1 BattleConditions/overlay, D6 | exhaustion clamp [0,6]. **Note:** exhaustion is overlay-ish but persists on character in v1; needs a component home (overlay or its own). MAX_EXHAUSTION_LEVEL=6. |
| P5 | PRESERVE | O1 overlay, D8 (cleared at end of combat) | clearCombatState wipes ailments + resets conditions. D8: combat overlay cleared at end of combat — aligns. |

---

## Q. Progression slice (`reduce/progression.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| Q1 | PRESERVE | D6 | victories adjust by delta, floor 0. |
| Q2 | PRESERVE | D6, H/I | addSpark round-trips leveling engine. |
| Q3 | PRESERVE | D6 | rankUpVirtue round-trips. |
| Q4 | PRESERVE | D6, D11 | Spark/virtue column projection. Durable state; see I-note on missing progression component. |

---

## R. Talents slice (`reduce/talents.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| R1 | PRESERVE | D6 | talentAdd appends, no-op if present. |
| R2 | PRESERVE | D6 | talentRemove filters; absent-key no-op returns patched clone. |

---

## S. Archetypes slice (`reduce/archetypes.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| S1 | PRESERVE | D6, O1 StatProfile | switchActiveArchetype patches active id. |
| S2 | PRESERVE | D6, O1 Inheritance | setInheritanceSlot replaces one slot. Inheritance component (D19). |
| S3 | PRESERVE | D6, O1 StatProfile/Inheritance | unlockArchetype appends at rank 1, spends saved rank; guards (unknown/owned/no-ranks/unmet-prereqs). Prereq logic must reproduce. |
| S4 | PRESERVE | D6, C4 (Mastery) | rankUpArchetype increments rank, spends saved rank; cap at Mastery rank 5. Crossing 5 surfaces Mastery via re-derive. |

**Note S:** `savedArchetypeRanks`, archetype ranks, inheritance slots, mechanicState — all durable authored state. D11 folds `characterArchetype` → StatProfile recipe + Mechanics. Covered, but `savedArchetypeRanks` (a character-level scalar) has no explicit O1 component (same family as currency/manual). Flagged.

---

## T. Mechanics slice (`reduce/mechanics.ts`)

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| T1 | PRESERVE w/ note | D17, O1 Mechanics | Each mechanic edit steps active archetype's mechanicState. **v2 generalization:** O1/D8 make Mechanics available to enemies/NPCs too; v1 ties to "active archetype." For PCs the active-archetype binding must be preserved; the component generalizes the *carrier*. |
| T2 | PRESERVE | D17 | Resolve active mechanic, null→initialState, discriminant-guard kind, no-op on mismatch. |
| T3 | PRESERVE | D17 (behavior registry carry-over) | Per-mechanic transitions (valor/perfection/stains/dawn/dusk/frenzy) clamped in modules. D17 carries v1 registry shape verbatim. |

---

## U. Foundation shapes & predicates

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| U1 | SUPERSEDE | D9 | `isFallen(currentHP) = currentHP ≤ 0` → D9: "fallen" is `damage ≥ maxHP`. Same condition, depletion vocabulary. |
| U2 | PRESERVE | D2 (vocab carry-over) | Vocabulary constants (VIRTUE_KEYS, PATH_CHOICES, battle-condition states/axes/flags, DEFAULT_BATTLE_CONDITION_TURNS). D2 carries foundation vocab. |
| U3 | PRESERVE | D2, O1 BattleConditions | DEFAULT_BATTLE_CONDITIONS all-neutral/flags-false. |
| U4 | PRESERVE | D2, D11 | sparkLogSchema cap 7; manualBonuses sparse. Schema-first discipline carries; see C9 manualBonuses GAP. |
| U5 | PRESERVE | D2, O1 Ailments | Ailments permissive string[]. |

---

## X. Cross-cutting invariants

| ID | Verdict | Maps to | Note |
|---|---|---|---|
| X1 | PRESERVE (core) | D9, D8, O1 | Derived values never persisted. v2 strengthens this: D8 (everything resolved fresh), D9 (depletion not currentHP). **But note** the consumable pools v1 stores — `currentHP/SP` (→ damage/spSpent, D9), `prismaCharges` (GAP J6), `*DiceRemaining` (GAP E3) — only HP/SP have a v2 storage home. |
| X2 | PRESERVE | D15 (parity), D8 | Optimistic-frame fidelity: re-derive through same resolve, slices mirror server guards. D15 golden-master enforces. |
| X3 | PRESERVE | D9/D10/D18, per-rule above | Consolidated rounding/clamping directions. D10 "operations own their bounds" is the umbrella; each direction maps to a PRESERVE above. Attribute clamp-after-sum, maxHP round, currency clamp, virtue/spark/level/rank caps all PRESERVE. |

---

## Summary

- **PRESERVE:** ~76 (incl. the "PRESERVE w/ GAP-flag" rows, which preserve the rule but lack a component home)
- **SUPERSEDE:** 14 (A3, A10, B9, B10, J2, J3, J4, J5, N1, N5, O1, U1 — plus the depletion-model framing)
- **GAP:** 4 storage-home gaps (see list)

(Exact counts in the return summary; the table above is authoritative per-ID.)

### GAP list (storage homes the component model is silent on)

These are not rule gaps — the *rules* preserve — but **O1's component catalog has no
home for several persisted scalar/consumable fields** v1 stores on the character:

1. **E3 — Hit Dice / Skill Dice remaining pools.** O1 has Vitals (`damage`) and SkillPool (`spSpent`); D9 covers HP/SP depletion only. The `hitDiceRemaining`/`skillDiceRemaining` consumable pools (refilled at level-up, H3) have no v2 component. Needs a dice-pool component (or extension of Vitals/SkillPool to a generic consumable).
2. **J6 — `prismaCharges`.** A consumable charge pool distinct from HP/SP. No O1 component. Could fold into `Counters`, but `Counters` is described only as "named counters (Lumina), overlay" — and Prisma is durable, not a combat overlay.
3. **K1 — currency.** Durable scalar with clamp [0, 99,999,999]. No O1 component.
4. **C9 / U4 — `manualBonuses`.** The sparse manual-bonus pool (a stat bonus *source* family, C3) is a `characters` column with no named component. It's neither a child table (so D11's "child tables fold into components" doesn't cover it) nor in O1.

Secondary (durable authored scalars with no explicit O1 component, lower-severity —
D11 implies they become entity columns/components but O1 doesn't enumerate them):
`savedArchetypeRanks` (S), `victories` (Q1), `sparkLog`/virtue ranks (I/Q), `gainedTalents` (L),
`exhaustion` level (P4). These are arguably covered by D11's "hot fields as columns" +
StatProfile recipe, but a v2 progression/resources component is undeclared.

### Genuinely ambiguous PRESERVE vs SUPERSEDE

- **A10 / B10 / N1 / N5 (the `toRawInputs` family).** Tagged SUPERSEDE because the *mechanism* (`HydratedCharacter` ⇄ `RawCharacterInputs` inverse) is replaced by component-map ⇄ durable-row projection (D11). But the *invariant* (lossless round-trip; reducer re-derives through the same pure pipeline) is a PRESERVE. Could be argued either way; classified by mechanism.
- **B9 (mechanic transform).** SUPERSEDE because v1's single post-assembly wholesale replace becomes the D8 layered fold. The *capability* (a mechanic replacing base attrs/affinities/skills) preserves exactly; only the layering changes. Borderline.
- **P4 exhaustion / I-Q progression / L talents** — preserve the rule, but whether they're "overlay" (cleared) or "durable" components is unspecified in O1. Exhaustion in particular: v1 persists it on the character (not the combat session), yet D8 clears the combat overlay at end of combat. If exhaustion is modeled as overlay it would be wrongly cleared — needs a design call on whether exhaustion is durable or overlay.
