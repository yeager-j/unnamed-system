# Combat Math & Mechanics — Preserve/Supersede/Gap Annotation

Validation of `requirements/02-combat-mechanics.md` against the v2 decision log
(`decision-log.md`, D1–D23 + O1). Each requirement is tagged **PRESERVE** (a rule
v2 must reproduce; mapped to the decision/component that lets it),
**SUPERSEDE** (behavior a decision deliberately changes), or **GAP** (the design
is silent or the model can't express it).

A recurring structural note governs many entries: the decision log is rich on
the **statblock/resolve** axis (D5/D8/D13/D17–D22) and the **vitals** axis
(D9/D10), but **near-silent on the attack-roll / damage-bonus / affinity
resolution algorithms** (inventory sections C and D). D8 lists
`weaponAttackRoll?` as a field of `ResolvedStatblock` and the `effects()`
pathway is carried over via D17, but the *resolver pipeline* itself — the
ordered contributor collection (C6), filter semantics (C7), scaler math
(C8/C9), source-row rules (C1/C4/C5), and the damage-formula fold (D1–D5) — is
never assigned a home. Those are tagged **PRESERVE** where a component plausibly
carries them and **GAP** where no decision accounts for the algorithm. See the
GAP summary at the bottom.

---

## A. Combat vocabulary & fixed sets

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| A1 | PRESERVE | D2 (foundation vocabulary carry-over) | 11 affinity damage types + Almighty-excluded-from-charts edge are carried-over fixed vocab. Consumed by O1 StatProfile/affinities + ResolvedStatblock. |
| A2 | PRESERVE | D2 | `DAMAGE_TYPES` = 11 + almighty. Carry-over. |
| A3 | PRESERVE | D2 | 6 affinity values; sparse-chart ⇒ Neutral edge must hold (enemy sparse charts, I3). |
| A4 | PRESERVE | D2 | DELIVERIES = [physical, magical]. Carry-over. |
| A5 | PRESERVE | D2 | ATTACK_ATTRIBUTES (incl. st-or-ma) + labels. Carry-over. |
| A6 | PRESERVE | D2 | RANGES + rangeSchema known/explicit union. Carry-over. |
| A7 | PRESERVE | D2 | Attack-tier shape; ordered sideEffects array. Carry-over. |
| A8 | PRESERVE | D2 | 24 side-effect keys (auto- as distinct keys). Carry-over. |
| A9 | PRESERVE | D2; O1 Ailments overlay | 12 ailment keys; downed-coexists; "track not resolve" non-goal (echoed in D14 inherited non-goals). Ailments overlay component (O1) holds them. |
| A10 | PRESERVE | D2; O1 Counters | 2 counter keys; sparse/drop-to-0; per-source caps NOT enforced (D14 explicitly lists Lumina/Tells caps as inherited non-goals — do not "fix"). Counters overlay (O1). |
| A11 | PRESERVE | D2; foundation/combat/engagement carry-over | Engagement union; symmetric + same-zone semantics. (Memory note: engagement homed in neutral foundation/combat/engagement.ts.) |
| A12 | PRESERVE | D2 | BONUS_TARGET_KEYS = 6. Carry-over; feeds B2 attribute effects. |

---

## B. Effect primitives

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| B1 | PRESERVE | D2; D18 (override transform kind) | Affinity effect schema. D18 classes affinity-set as an "override" transform; the effect *schema* itself is carried-over vocab. |
| B2 | PRESERVE | D2; D18 (delta transform kind) | Attribute effect (flat int). D18's additive "delta" maps to this. |
| B3 | PRESERVE | D2 | attackRollFilter `when` (3 axes, intersect, empty matches all). Consumed by C7/D3 resolvers. |
| B4 | PRESERVE | D2; F1/F2 party composition | perPartyLineage scaler incl. includesSelf self-exclusion. Depends on party-composition derivation surviving (see F). |
| B5 | PRESERVE | D2 | attackRoll effect amount XOR scaler refine. Carry-over schema. |
| B6 | PRESERVE | D2 | damageDice schema. |
| B7 | PRESERVE | D2 | damage effect dice XOR amount refine; display-only (no resolved total). |
| B8 | PRESERVE | D2; O1 (zone-enchantment channel) | CombatantEffect union; the "effect from anywhere" type. The Bard enchantment channel (E) feeds it. |

---

## C. Attack-roll resolution

The resolver algorithm is the largest under-specified area. v2 names
`weaponAttackRoll?` / `abilities?` as ResolvedStatblock outputs (D8) and carries
the `effects()` pathway (D17/G7), but **does not name a component or decision
that owns the attack-roll resolver pipeline**. Tagging the schema/data carry-over
as PRESERVE, the algorithm placement as GAP where unaccounted.

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| C1 | PRESERVE | D8 (ResolvedStatblock.weaponAttackRoll) — *home unstated* | Rolling Attribute is always sources[0] even at 0/neg. No decision states *where* this resolver lives or guarantees the sources-ordering contract. Behavior must be reproduced; placement is a GAP risk (see C-summary). |
| C2 | PRESERVE | D8 base StatProfile attributes | st-or-ma ⇒ max(St,Ma); 1:1 others. Reads resolved attributes (D8). Logic itself unhomed. |
| C3 | PRESERVE | D8/D17 effects pathway | Total = rolling attr + matching effect contributions. The "matching effect contribution" is exactly G7 `effects()` carried by D17 — but the *summation/total assembly* is unhomed. |
| C4 | PRESERVE | (algorithm) | 0-resolving effects omitted from sources. Pure-resolver contract; no decision names it. |
| C5 | PRESERVE | (algorithm) | Unlabeled effect ⇒ "Bonus". Display/label rule; unhomed. |
| C6 | PRESERVE | D8 fold order analog; D17 active-mechanic | **Contributor order = active mechanic → active passive skills → context effects.** D8 fixes the *statblock* fold order but this is a *separate* attack-roll contributor order. "Only active mechanic contributes" aligns with D17/G9 (inactive archetypes contribute nothing). Order contract itself is unhomed → GAP risk. |
| C7 | PRESERVE | B3 schema | Filter axis matching incl. undefined-axis-fails. Pure semantics over carried-over filter schema; algorithm unhomed. |
| C8 | PRESERVE | F1/F2 party composition | perPartyLineage: amount × count; null comp ⇒ 0. Depends on F surviving. |
| C9 | PRESERVE | F1/F2; D8 active form/lineage | Self-exclusion via activeLineage vs scaler lineage. Note: "active lineage" must be readable post-resolve; a form swap (D8) changes the active profile but **lineage is an entity/identity fact** (D13 boundary: identity survives a form swap), so activeLineage should remain stable. Reproducible, placement unhomed. |
| C10 | PRESERVE | B5 | amount ?? scaler ?? 0. |
| C11 | PRESERVE | (algorithm); A7 tier shape | skillAttackRollContext derivation; ailment-arm absence of damageType/delivery is meaningful (toStrictEqual). No decision addresses skill-context derivation. |
| C12 | SUPERSEDE | D46 (supersedes); D17/G7, C6 | v1's `attackRollEffectsFromSkills` collected attackRoll effects **only** from passive Skills. **D46:** v2 folds every collected Skill's `effects[]` (incl. attackRoll) regardless of castability — `kind: "passive"` is the castability axis, not an effects gate. Shared char+enemy path unchanged; `skillEffects` is the one fold, `resolve` surfaces attackRoll effects via `pendingEffects`. |
| C13 | PRESERVE | E8; B8 | Context (zone-enchantment) effects fold in by source label, apply to every attack kind. Bard channel (E) → CombatContext.zoneEffects. |
| C14 | PRESERVE | D8; F (party comp) | Character resolver wiring: computeAttributes (now resolve, D8) + collect effects + scaler vs party comp. The "computeAttributes" becomes `resolve`'s attribute output (D5/D8) — a *supersede of the input*, but the resolver contract is preserved. |
| C15 | PRESERVE / SUPERSEDE-adjacent | D8 (uniform resolve); I3/J2 | Enemy resolver wiring: flat attributes, scaler ⇒ fixed amount. **The PC/enemy split here is superseded in spirit by D8** (one resolve path, no per-side function), but the *enemy numeric behavior* (no lineage scaler ⇒ amount ?? 0) is PRESERVE. v2 must keep enemy scalers resolving to their flat amount even though the resolver is unified. |

**C-section structural finding:** No decision (D1–D23) or O1 component names the
**attack-roll resolver** as a system, nor guarantees its contributor-order (C6),
sources-ordering (C1/C4), or label (C5) contracts. D8 only declares the *output
field* `weaponAttackRoll?` and *skills* in ResolvedStatblock. The component model
*can* express this (a resolver reading ResolvedStatblock + mechanic effects +
zone effects), but the design is **silent** on it. Flagged as **GAP (algorithm
home)** — not a model defect, an omission the test-first build must cover.

---

## D. Damage-bonus resolution

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| D1 | PRESERVE | (algorithm); B7 | resolveDamageBonuses folds matching DamageEffects into labelled lines. No decision homes the damage-bonus resolver. |
| D2 | PRESERVE | D17 active-mechanic; D8 | Contributors = active mechanic → context effects (passives skipped). Mirrors C6 minus passives. Unhomed algorithm. |
| D3 | PRESERVE | C7 / B3 | Reuses matchesFilter. |
| D4 | PRESERVE | (algorithm) | Damage label formatting incl. Unicode minus, "Bonus" fallback. Display rule; unhomed. |
| D5 | PRESERVE | (algorithm) | foldDamageBonusesIntoFormula splice semantics. Pure string transform; no decision references it. |

**D-section finding:** Same as C — the damage-bonus resolver has **no named home**
in the design. Frenzy (H6) is the one MVP mechanic that emits damage effects via
`effects()`, so this pipeline is load-bearing and must be reproduced. **GAP
(algorithm home).**

---

## E. Zone Enchantment effects (Bard)

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| E1 | PRESERVE | D2; D14 (O11 note) | 3 enchantment types, MAX_FORTE=3. D14 explicitly notes only Toccata is engine-modeled; Requiem/Tarantella prose-only — carried as-is. |
| E2 | PRESERVE | O1 (session/overlay); D21 | Single active enchantment on session; overwrite; cleared at combat end. Session-scoped overlay (combat overlay layer, D8 layer 5). |
| E3 | PRESERVE | D2 | forteMarking clamp. |
| E4 | PRESERVE | D2; engine-owned behavior | Forte cumulative; forteLines. Engine-owned (like mechanics registry, D17 carve-out). |
| E5 | PRESERVE | D8 layer-5 overlay; B8 | Toccata ⇒ attackRoll amount = forte. Feeds C13 context channel. |
| E6 | PRESERVE | D14 | Requiem/Tarantella ⇒ []. D14: "only Toccata is engine-modeled; Requiem/Tarantella prose-only … action-economy transform layer is partly greenfield." Tarantella's action grants relate to D21 (resolved budget) but are deliberately NOT modeled — PRESERVE the empty-effects behavior. |
| E7 | PRESERVE | engine-owned registry | getEnchantment total over closed union. Like getMechanic (D17). |
| E8 | PRESERVE | C13; D8 overlay | zoneEnchantmentEffects gated on zoneId match. Feeds the attack-roll context channel. Depends on Position/zone (O1 Position) + the unhomed attack-roll resolver. |

**E-section note:** The Bard mechanic (H9) is `effects`-less and routes through
this zone channel, NOT through D8's mechanic `transform`. The design's D8/D17
emphasis on `transform` does **not** cover this routing; it relies on the
`CombatContext.zoneEffects` channel, which the design references only obliquely
(D21 "zone enchantment" as an action-budget transform). The *attack-roll* zone
channel (E5/E8 → C13) is unhomed alongside C/D. See mechanics finding.

---

## F. Party composition derivation

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| F1 | PRESERVE | O1 (session combatants, Allegiance, identity/lineage) — *home unstated* | derivePartyComposition counts PC combatants on a side by lineage, incl. self. v2: "side" = Allegiance (O1); "pc ref" check becomes a capability/Presentation check; lineage resolved from entity identity. **No decision names party-composition derivation.** The model can express it (iterate session entities with Allegiance + lineage), but it's unmentioned → GAP risk. |
| F2 | PRESERVE | (same) | per-side map. Same home gap. |

**F-section finding:** Party-composition is the input to the only live scaler
(B4/C8/C9, perPartyLineage — used by e.g. a Lineage-synergy passive). The design
never mentions it. **GAP (algorithm home).** Note one subtlety v2 must get right:
F1 skips non-`pc` refs; under D1's "no kind branches," v2 must reframe "is a PC"
as a capability/Presentation predicate (D7 Presentation hint or a lineage-bearing
StatProfile), not a `kind` switch — the design's anti-kind stance (D7/D16) is
compatible but the rephrasing is unaddressed.

---

## G. Mechanics registry

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| G1 | PRESERVE | D17 | 9 MVP mechanics registered once. D17 carries over v1 registry shape keyed by kind. |
| G2 | PRESERVE | D17 | getMechanic ⇒ def or undefined. Carried over (G2 referenced by D17 getMechanic). |
| G3 | PRESERVE | D17 | getTypedMechanic. Carry-over. |
| G4 | PRESERVE | D17; O1 Mechanics component | initialStateFor for null coercion. Mechanics component = { states: Record<MechanicKey, MechanicState> } (O1). |
| G5 | PRESERVE | D17/G7 | mechanicEffectsFor ⇒ effects or []. D17: resolve consults getMechanic(key).transform; **but the `effects()` pathway (G5/G7) is the one all MVP mechanics actually use** — see mechanics finding. |
| G6 | PRESERVE | D17; G7 | MechanicDefinition contract incl. transform + resetOn. D14 confirms transform/resetOn were v1 stubs; D8/D17 are their call-site. |
| G7 | PRESERVE + SUPERSEDE | D8/D17/D18 | **Two pathways: `effects` (additive declarative) and `transform` (wholesale base-rewrite).** SUPERSEDE: transform was call-site-less in v1 (D14); D8/D17 wire it (forms/Arcana) and D18 formalizes override-vs-delta. PRESERVE: the `effects` pathway and its declarative union are unchanged — and it is the pathway **every MVP mechanic uses** (transform is unused by all 9, per inventory). v2 must keep `effects()` first-class, not collapse everything into transform. |
| G8 | PRESERVE | D17/G6 | MechanicEffectContext { stats: StatContext }; read-only. v2 StatContext ≈ resolve inputs (D8). No current mechanic reads it. |
| G9 | PRESERVE | D11 (mechanicState persistence); D17 | Persisted state union validated at JSONB boundary; ActiveMechanic; inactive archetypes contribute nothing. D11: mechanicState folds into the Mechanics component jsonb. "Active vs inactive archetype" must remain expressible — D8 active-form/active-archetype concept covers it. |

---

## H. Per-mechanic behavior contracts — D8/D17 coverage audit

For each of the 9 mechanics: does the D8 resolve-fold + D17 registry +
D18 override/delta model account for its behavior? The decisive fact from the
inventory (G7): **no MVP mechanic uses `transform`; all engine-visible behavior
flows through `effects()` (additive) or no effects at all (display-only).** D8's
narrative centers on `transform` (forms/Arcana), which are the *future* mechanics
the model is designed for — not the 9 shipped ones.

| ID | Mechanic | Tag | Pathway | Accounted by? |
|---|---|---|---|---|
| H1 | Perfection (Warrior) | PRESERVE | `effects()` → attackRoll delta | **Yes** — D17 effects pathway + D18 delta. Rank clamp/labels are mechanic-internal pure logic (carried over). attackRoll *consumption* depends on the unhomed C resolver. |
| H2 | Valor (Knight) | PRESERVE | `effects()` → affinity override at value≥3 | **Yes** — D18 "override" (affinity set). Threshold gating is mechanic-internal. Affinity override must reach ResolvedStatblock.affinities (D8 layer fold) — accounted. |
| H3 | Path of Dawn (Healer) | PRESERVE | display-only (no effects) | **Yes** — Mechanics component holds state (O1); setDawnMode is a pure state write. No resolve contribution needed. |
| H4 | Path of Dusk (Warlock) | PRESERVE | display-only | **Yes** — same as H3. |
| H5 | Stains (Mage) | PRESERVE | display-only; 4-slot token array | **Yes** — state shape in Mechanics component; setStainSlot/clearStains pure. Out-of-range no-op + schema validation carried over. No resolve contribution. |
| H6 | Frenzy (Berserker) | PRESERVE | `effects()` → **damage** effect | **Yes for the effect model** (D17/G7 + D18 delta), **BUT** the consumer is the **damage-bonus resolver (section D), which has no home in the design.** Frenzy is the live proof that the unhomed D-resolver is load-bearing. pain/frenzyMode coupling is mechanic-internal. |
| H7 | Thief's Insight (Thief) | PRESERVE | display-only (Tells at table) | **Yes** — discriminant-only state in Mechanics component. Per-enemy Tell caps are a D14 inherited non-goal. |
| H8 | Elemental Larceny (Elemental Thief) | PRESERVE | display-only | **Yes** — same as H7. (Note: gated archetype per lib/archetypes/restricted.ts — orthogonal to engine.) |
| H9 | Enchantment (Bard) | PRESERVE | display-only on the row; **effects route through the zone channel (E), not the mechanic** | **Partially** — D17 holds the discriminant state, but the engine-visible effect flows through `zoneEnchantmentEffects` → `CombatContext.zoneEffects` → the attack-roll context channel (C13/E8), which is **NOT the mechanic transform/effects pathway** and is **unhomed** in the design (same C/D/E gap). The mechanic registry entry alone does not produce Bard's effect. |

**Mechanics verdict (D8/D17 vs all 9):**
- The **registry + state persistence** for all 9 is fully accounted by D17 + O1
  Mechanics component + D11 (mechanicState in jsonb).
- The **`effects()` additive pathway** (Perfection, Valor, Frenzy) is accounted
  by D17/G7 + D18 — *provided* the attack-roll / damage-bonus resolvers that
  consume those effects exist (they are the C/D GAP).
- **Display-only mechanics** (Dawn, Dusk, Stains, Thief's Insight, Elemental
  Larceny) are fully accounted — state lives in the Mechanics component, no
  resolve contribution.
- **Bard/Enchantment (H9)** is the one whose engine-visible behavior the
  D8/D17 transform-or-effects model does **NOT** directly express: its effect is
  produced by the separate zone-enchantment channel (E) feeding the attack-roll
  context, which the design never homes. Not a *contradiction* of the model, but
  a behavior the resolve-fold/registry story does not cover on its own.
- **No mechanic's behavior requires `transform`** today, so D8's transform layer
  is correct-but-unexercised by the 9 (validated future-proofing, per D14). No
  mechanic's behavior is *inexpressible* under the model; the gaps are about the
  **unhomed resolver/channel that consumes mechanic effects**, not the mechanic
  model itself.

---

## I. Statblock derivation (PC vs enemy)

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| I1 | SUPERSEDE | D8 | `Statblock` (provenance-tagged `source: "character"|"enemy"`) → `ResolvedStatblock` computed by the resolve-fold; provenance demoted (D7 Presentation hint). New shape `{ attributes, maxHP, maxSP, affinities, skills, weaponAttackRoll?, abilities? }`. **PRESERVE within it:** the field *contents* (attributes/maxHP/affinities/skills/weaponAttackRoll/abilities) must still be produced. |
| I2 | SUPERSEDE | D8/D5 | `statblockFromCharacter` (PC converging function) → base StatProfile **derived recipe** layer of resolve (D5). No more per-side function. PRESERVE: PC has level + full affinity chart (D2/D8). |
| I3 | SUPERSEDE | D8/D5 | `statblockFromEnemy` → base StatProfile **flat profile** layer. PRESERVE: enemy sparse affinities (absent ⇒ Neutral, A3), nullable level/affinities for provisional inline enemy. D13: enemy instance level from catalog def, not a column. |
| I4 | SUPERSEDE | D8; D11 (enemy instances ephemeral) | `resolveCatalogEnemyStatblocks` (per-key Record, dedup) → resolve runs per ephemeral enemy entity (D11 session-blob component map; enemy def in TS catalog). PRESERVE: dedup-per-key + omit-unresolvable behavior must be reproduced for the catalog-enemy combatant case (an instance referencing an enemyKey). **Mild GAP risk:** D11 makes each enemy an entity instance; the v1 "resolve once per key, share across combatants of that key" dedup is a performance contract the entity-per-instance model does not obviously preserve — flag for the build. |

---

## J. Enemy skill hydration

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| J1 | PRESERVE | D8 base flat profile (skills); data catalog | skillKeys (getSkill, drop misses) + inlineSkills appended. Enemy def skills are part of the flat StatProfile (O1). |
| J2 | PRESERVE / SUPERSEDE-adjacent | D8 unified resolve; C15 | Attack rolls vs enemy flat attributes; no-context ⇒ null. **SUPERSEDE:** the *separate enemy hydration path* collapses into the one resolve (D8 "nothing re-derives per side"). **PRESERVE:** the numeric result (flat attributes, amount ?? 0). Consumer = the unhomed attack-roll resolver (C). |
| J3 | PRESERVE | C12; D17/G7 | Enemy's own passive attackRoll effects fold across both sources. Same `attackRollEffectsFromSkills` (C12) shared char+enemy — consistent with D8 unification. |
| J4 | PRESERVE | C15 | Scaler ⇒ fixed amount (or 0) for enemies (no party scalers). |
| J5 | PRESERVE | (algorithm); D2 | Merged list sorted by kind (sortSkillsByKind order + damage-type rank + name). Sorting in engine not renderer. No decision names skill sorting; D7 says renderers bind to capabilities — sorting must stay engine-side. PRESERVE; minor home gap. |
| J6 | PRESERVE | D8/D9 (SP as capability) | Enemy costs resolve vs maxHP to satisfy type but are inert; no SP pool. **This is the canonical D8/D1 win** (enemy-has-no-SP → SkillPool capability absent, O1). PRESERVE the "cost row suppressed" behavior via D20 visibility/capability presence (no SkillPool ⇒ no cost). |
| J7 | PRESERVE | D8 ResolvedStatblock.skills; D9 | hydrateSkill assembles HydratedSkill; cost-bearing kinds get resolvedCost vs maxHP, passive ⇒ null. Skill resolution shape. Note: strict-`>` HP / `>=` SP affordability (D14/D15 PRESERVE) is a *separate* operation-bound rule (D10) not captured by J7 itself but called out in D14. |

---

## K. Enemy catalog view-models (browse/filter/group)

| ID | Tag | Maps to | Notes |
|---|---|---|---|
| K1 | PRESERVE | D2; D11 (catalog in TS) | EnemyDefinition shape; no family field (derived from directory). Authored catalog (D11 storage matrix: enemy def in TS catalog). |
| K2 | PRESERVE | D2 | 6 enemy families; getEnemyFamily. Carry-over (v1 getEnemyFamily). |
| K3 | PRESERVE | (view-model) | buildEnemyCatalogRows; weaknesses = "weak" entries. Pure projection over catalog. No decision references catalog browse view-models. |
| K4 | PRESERVE | (view-model) | filterEnemyCatalogRows (search + family intersect). |
| K5 | PRESERVE | (view-model) | groupEnemyRowsByLevel (ascending, name-sorted). |
| K6 | PRESERVE | (view-model) | enemyFamilyCounts (sparse, totals row count). |

**K-section note:** The catalog browse/filter/group view-models (K3–K6) are pure
projections over authored enemy data and are **not addressed by any decision**
(the design focuses on the runtime entity/resolve model, not the DM-facing enemy
browser). Low-risk PRESERVE — they sit above the engine model and port
mechanically — but the design is silent. Minor GAP (unmentioned), not a model
defect.

---

## Totals

- **PRESERVE:** 58
- **SUPERSEDE:** 6 (I1, I2, I3, I4, G7 [dual], J2 [dual]) — counting the
  primarily-superseded requirements; G7 and J2 are dual PRESERVE+SUPERSEDE and
  C15 is supersede-adjacent.
- **GAP (algorithm/home unaccounted, not model-inexpressible):** the C-resolver
  pipeline, the D-resolver pipeline, the E→C attack-roll zone channel, F
  party-composition, J5 skill sort, K3–K6 view-models. See list below.

(Counts treat each lettered ID once; dual-tagged rows counted under their primary
tag with the secondary noted in the table.)

---

## Explicit GAP list (design silent / home unassigned)

None of these are *inexpressible* under the component model — the model can carry
them. They are places the decision log **does not name a home or guarantee a
contract**, so the test-first build (D15) must cover them or risk silent
regression:

1. **Attack-roll resolver pipeline (C1, C4, C5, C6, C7, C10, C11)** — no decision
   names the attack-roll resolver, its contributor order (C6), its
   sources[0]/0-omit/label contracts (C1/C4/C5), or skill-context derivation
   (C11). D8 only declares the output field `weaponAttackRoll?`. **Highest-impact
   gap** — Perfection/Valor/Frenzy and all enemy attacks depend on it.
2. **Damage-bonus resolver pipeline (D1, D2, D4, D5)** — no home for
   resolveDamageBonuses / label formatting / formula fold. Frenzy (H6) is the
   live consumer.
3. **Zone-enchantment → attack-roll context channel (E5, E8 → C13)** — the path
   by which Bard's (H9) and Toccata's effects reach an attack roll
   (`CombatContext.zoneEffects`) is referenced only as an action-budget transform
   (D21), never as the attack-roll context channel it actually is.
4. **Party-composition derivation (F1, F2)** — unmentioned; the sole input to the
   perPartyLineage scaler (B4/C8/C9). Also needs the v1 "is a PC" check rephrased
   as a capability predicate (D1/D7 compatible but unaddressed).
5. **Catalog-enemy statblock dedup (I4)** — D11's entity-per-instance model does
   not obviously preserve v1's "resolve once per enemyKey, share" dedup contract.
6. **Engine-side skill sort (J5)** — sortSkillsByKind must stay in the engine
   (D7 keeps logic out of renderers), but no decision homes it.
7. **Enemy catalog view-models (K3–K6)** — pure browse/filter/group projections
   not addressed by any decision (design is runtime/resolve-centric).

---

## D8/D17 vs all 9 mechanics — direct answer

The D8 resolve-fold + D17 registry + D18 override/delta model **accounts for the
behavior of all 9 mechanics**, with these qualifications:

- 5 are **display-only** (Path of Dawn, Path of Dusk, Stains, Thief's Insight,
  Elemental Larceny): fully accounted — state in the O1 Mechanics component, no
  resolve contribution.
- 3 use the **`effects()` additive pathway** (Perfection → attackRoll delta;
  Valor → affinity override; Frenzy → damage delta): accounted by D17/G7 + D18 —
  **but their effects are consumed by the attack-roll/damage-bonus resolvers that
  the design never homes (GAPs 1–2).** The mechanic side is fine; the consumer is
  the gap.
- **Bard/Enchantment (H9)** is the one whose engine-visible effect the
  D8/D17 transform-or-effects model does **NOT** express on its own: it produces
  no mechanic effect; its effect is computed by the separate
  `zoneEnchantmentEffects` channel (E) and injected as attack-roll context. The
  registry entry is display-only. This channel is unhomed in the design (GAP 3).

**No mechanic requires `transform`** today — all 9 are `effects()` or
display-only — so D8/D18's `transform`/override-vs-delta machinery is
correct-but-unexercised by the shipped set (it exists for the future
Shapechanger/Nyx forms, exactly as D8/D14 state). **No mechanic's behavior is
inexpressible** under the component/resolve model. The risk is entirely in the
**unhomed resolver + zone channel that consume mechanic effects**, not in the
mechanic model itself.
