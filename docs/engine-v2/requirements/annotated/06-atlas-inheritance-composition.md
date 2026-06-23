# 06 — Atlas, Inheritance, Archetype Display, Affinity, Rank Gates, Composition Root, Setup Placement, Map Geometry — ANNOTATED

Validation pass: each requirement classified PRESERVE / SUPERSEDE / GAP against the
engine-v2 decision log (D1–D23, O1). PRESERVE = a game rule v2 must reproduce
exactly; SUPERSEDE = behavior a decision deliberately changes; GAP = the design is
silent or cannot express it.

Legend: **mapped** = the decision(s)/component(s) that account for the requirement.

---

## A. Lineage Atlas (`archetypes/atlas.ts`)

**Threshold finding (applies to all of A and B):** The Atlas is a **growth/progression
surface** — a pure projection over the catalog + the character's owned-Archetype rows
(`CharacterArchetype` / its v2 successor). The decision log never names the Lineage
Atlas, `buildLineageAtlas`, or `getAtlasRecommendations` as a derivation, a resolve
layer, or a component. It is **not** derivable off `ResolvedStatblock` (which is
attributes/maxHP/maxSP/affinities/skills — D8) because the Atlas surfaces *unlocked /
locked / unlockable* archetype-tree state and recommendations, which `resolve` never
computes. The owned-archetype source data is folded into the **StatProfile** component
(D11: "`characterArchetype` (+`mechanicState`) → StatProfile recipe + Mechanics") and
the **Inheritance** component (D19), so the *inputs* have a home, but the Atlas
*builder/recommender functions themselves are unhomed*. They appear in H1's bound-method
set (`buildLineageAtlas`, `getAtlasRecommendations`), confirming v2 keeps them as
composition-root boundary functions — but no D-entry describes how they re-home onto the
component model. **Classified PRESERVE (these are exact game rules v2 must reproduce),
mapped to D23/H1 as the only structural home, and flagged: the Atlas as a surface is
otherwise undescribed in the design.**

**A1.** PRESERVE — twelve Lineages in canonical `LINEAGES` order. mapped: D23/H1
(boundary fn survives), D2 (foundation `LINEAGES` vocab carried over). Note: pure
catalog projection; no component re-homing described.

**A2.** PRESERVE — four tier columns in `ARCHETYPE_TIERS` order, empty column kept.
mapped: D23/H1, D2 (carried catalog vocab). Atlas-internal shaping; design silent on
re-home.

**A3.** PRESERVE — within a Lineage, sort by key (`localeCompare`); re-bucket by
`archetype.tier`. mapped: D23/H1. Sort/bucket order is an exact rule to reproduce.

**A4.** PRESERVE — `hiddenArchetypeKeys` drops keys before any shaping; excluded from
`total`/`unlockedCount`. mapped: D23/H1. App layer (viewer identity) supplies keys —
overlaps D20 visibility conceptually, but D20 is the *resolved-statblock* per-component
filter, NOT catalog pre-filtering; the design does not connect the two. Note as a
distinct mechanism the design doesn't address.

**A5.** PRESERVE — owned node `state: {owned|mastered, rank}`, `characterArchetypeId`
set, bumps `progress.owned`. mapped: D23/H1; owned-row source is StatProfile recipe
(D11). Mastery boundary cross-refs G1.

**A6.** PRESERVE — owned row with non-catalog `archetypeKey` is silently ignored
(data-drift tolerance, never throws). mapped: D23/H1. Robustness rule to reproduce.

**A7.** PRESERVE — `parentKeys` = prerequisites' `archetype` keys (tree links).
mapped: D23/H1.

**A8.** PRESERVE — `originLineage` resolves only from the row whose id ==
`originCharacterArchetypeId`; `null` on missing/unknown; `isOrigin` stamped on exactly
the matching Lineage. mapped: D23/H1. Origin-row-only resolution is an exact rule.

**A9.** PRESERVE — `LineageAtlasView` passes through `savedRanks` and `unlockedCount`.
mapped: D23/H1.

**A10.** PRESERVE — `unmetPrerequisites`: prereq met when
`(ownedRankByKey.get(prereq.archetype) ?? 0) >= prereq.rank`; declaration order;
`>=` boundary; unowned defaults to 0. mapped: D23/H1; `>=` gate echoes G2/D15-PRESERVE.
This is the **Atlas prerequisite gating** the prompt calls out — exact rule, must
reproduce.

**A11.** PRESERVE — `atlasNodeState` four-way (mastered/owned/locked/unlockable);
**owned wins over prereq check**; mastery boundary `rank >= 5`. mapped: D23/H1; mastery
gate G1. Exact gating rule.

**A12.** PRESERVE — `isAtlasNodeUnlocked` true for owned/mastered only. mapped:
D23/H1.

**A13.** PRESERVE — `filterAtlasLineagesToUnlocked` keeps owned/mastered nodes, drops
empty Lineages, leaves `progress` counts untouched. mapped: D23/H1.

---

## B. Atlas recommendations (`getAtlasRecommendations`)

All of B is **recommendation sort-order / gating rules** — exact behavior to
reproduce. mapped throughout: D23/H1 (boundary fn, curried deps-first per B11/H2),
D2 (`LINEAGES`/`DAMAGE_TYPES`/path vocab). No component re-homing described — same
unhomed-surface flag as section A.

**B1.** PRESERVE — 0–3 filled slots, never >3, no key repeats. mapped: D23/H1.

**B2.** PRESERVE — level-ceiling gate: `[]` iff `savedRanks === 0 && level >= MAX_LEVEL`;
both conditions required. mapped: D23/H1. Consumes `level` (D13 entity column) — an
input the design homes, though the gate logic itself is undescribed.

**B3.** PRESERVE — only `unlockable`/`owned` recommendable; `locked`/`mastered` never.
mapped: D23/H1.

**B4.** PRESERVE — Slot 1 origin pick, sort `tierRank → actionRank → key`
(`localeCompare`); tier leads action. mapped: D23/H1. Exact multi-key sort order.

**B5.** PRESERVE — Slots 2–3 fill pool, sort `fillPriority → actionRank → tierRank →
key`; excludes slot-1 key; cap 3. mapped: D23/H1. Exact sort order.

**B6.** PRESERVE — `fillPriority` buckets 0/1/2 (in-progress `>0` / on-Path / new-damage-
type); strict ordering. mapped: D23/H1; `LINEAGE_SUGGESTED_PATH` vocab (D2). Exact rule
incl. `> 0` primary-key boundary.

**B7.** PRESERVE — fill-pool eligibility filter (in-progress OR on-Path OR introduces
new damage type). mapped: D23/H1.

**B8.** PRESERVE — reason precedence (origin → in-progress → on-Path → new-damage-type).
mapped: D23/H1. **Inventory itself flags the dual-encoding drift risk (B8 ambiguity
flag); the design says nothing about consolidating the two code paths — carry the flag
forward.**

**B9.** PRESERVE — `archetypeDamageTypes` skips `"special"` and non-`attack` Skills;
unresolved skill key contributes nothing. mapped: D23/H1; consumes `getSkill` port
(B11/D23 GameData adapter). `DAMAGE_TYPES` vocab D2.

**B10.** PRESERVE — `accessibleDamageTypes` = union of attack damage types over unlocked
nodes; `introducesNewDamageType` measured against it. mapped: D23/H1.

**B11.** PRESERVE — curried deps-first: outer `Pick<GameData,"getSkill">`, inner
`(view, pathChoice, level)`. mapped: **D23 + H2** (deps-first currying is the v2
composition-root contract verbatim). Directly accounted for.

---

## C. Archetype display & preview (`archetypes/utils.ts`)

Archetype display is a read-model shaping surface. Inputs (owned rows, inheritance
slots, equipment) re-home onto StatProfile/Inheritance/Equipment components (D11/D19/
D22), but the display *functions* are unhomed beyond H1 binding them. The functions
read `HydratedCharacter` today; v2's god-type is dissolved (D2/D8 `ResolvedStatblock`),
so these signatures must be re-expressed against components — **the design does not
describe that re-expression.** Flagged per-item where it bites.

**C1.** PRESERVE — one `ArchetypeEntry` per resolvable row in row order; non-resolving
skipped. mapped: D23/H1.

**C2.** PRESERVE — `isActive: row.id === character.activeArchetypeId`. mapped: D23/H1.
GAP-adjacent: `activeArchetypeId` is the active-archetype pointer; the v2 entity model
(D11/O1) has no named field for it. StatProfile recipe is the source row data, but
*which* archetype is active is unhomed. **Flag: active-archetype selection field
unmodeled.**

**C3.** PRESERVE — `ranks` = one `RankedSkill` per Rank-keyed Skill (`{...skill, rank}`);
unresolved dropped; `synthesis` resolved or null. mapped: D23/H1.

**C4.** PRESERVE — costs/attack-rolls resolve against live character stats
(`toStatContext`), `maxHP`, `partyComposition`. mapped: D23/H1; `toStatContext`/`maxHP`
become `ResolvedStatblock` reads (D8). `perPartyLineage` party-count scaling is a
mechanic-style transform — partially D8/D18, but the design never names party-composition
scaling. Mostly accounted for; party-scaling input unaddressed.

**C5.** PRESERVE — inheritance-slot resolution: one `ResolvedInheritanceSlot` per slot;
empty slot (`skillKey === null`) **always valid**; configured slot valid only when
source Archetype resolves AND `isInheritableSkill(...)`. mapped: **D19 (Inheritance
component `{slots: InheritanceSlots}`)** + D23/H1. This is the core inheritance-slot
rule the prompt asks about — the Inheritance component (O1) homes the *data*, but D19
describes inheritance only as a *resolve pass-through layer* (skills flow into
`ResolvedStatblock`); it does **not** describe slot *validity resolution* (the
`isValid` stale-slot rule). **Flag: D19 supports inheritance-through-forms but is silent
on the read-side slot-validity / stale-slot surfacing rule.**

**C6.** PRESERVE — `getArchetypeDisplay` returns `{activeEntry}` or null. mapped:
D23/H1. Same `activeArchetypeId` flag as C2.

**C7.** PRESERVE — `previewArchetypeSkills` against synthetic Rank-2, equipment-less,
single-Archetype StatContext with picked `pathChoice`. mapped: D23/H1; synthetic
StatContext = a constructed StatProfile (D5/D8). Accounted for structurally.

**C8.** PRESERVE — `archetypeSwitcherGroups`: unlocked Archetypes grouped by Lineage in
`LINEAGES` order; empty Lineages omitted; non-resolving skipped. mapped: D23/H1.

**C9.** PRESERVE — option carries `{id, name, tier, rank, mechanicName}`; `mechanicName`
= Mechanic `displayName` or null. mapped: D23/H1; Mechanics registry D17.

**C10.** PRESERVE — sort tier then name; one group per Lineage. mapped: D23/H1.

**C11.** PRESERVE — `sortArchetypesByPath` returns new array (no mutation), three Path
buckets rotating with Path; ties → `LINEAGES` order; discovery-only (never gates
selectability). mapped: D23/H1; path vocab D2.

---

## D. Inheritance source resolution (`archetypes/inheritance.ts`)

**D1.** PRESERVE — `isInheritableSkill` true iff source declares a Rank-keyed Skill at
that key whose required rank the source has unlocked; Synthesis excluded by
construction; `>=` rank gate. mapped: **D19 (Inheritance component)** + G2 (`>=` rank
gate, D15-PRESERVE) + D23/H1. This is **inheritance source resolution** — the prompt's
named PRESERVE. D19 establishes the Inheritance component and full form pass-through, so
inherited skills have a resolve home; the *inheritability predicate* (rank-gate +
synthesis-exclusion) is an exact rule D19 assumes but does not restate. mapped to D19 +
G2; flag that the predicate is unrestated.

**D2.** PRESERVE — `inheritanceSourceGroups(entries, ownerRowId)`: one group per *other*
unlocked Archetype (owner excluded); `skills` filtered to in-rank; all-over-rank source
dropped. mapped: D19 + D23/H1. Source-resolution rule; reuses `ArchetypeEntry.ranks`.
Accounted for structurally via D19's Inheritance component; the grouping/filtering rule
is undescribed.

---

## E. Affinity base resolution (`archetypes/affinity.ts`)

**E1.** PRESERVE — `resolveAffinity`: `"almighty"` → `"neutral"` unconditionally; else
`archetype.affinities[damageType] ?? "neutral"` (absent = Neutral). mapped: D8
(affinities are a `ResolvedStatblock` field, resolved in the fold) + D2 (`DAMAGE_TYPES`).
This is **affinity-base resolution** — a named PRESERVE. D8 resolves the affinity chart;
the almighty-unconditional-neutral + sparse-chart-fallback rules are exact rules the
fold must reproduce. Accounted for by D8 as the resolve home.

**E2.** PRESERVE — granted Affinity candidate **replaces** Archetype base regardless of
priority; base is the **zero-candidate fallback**, NOT in the `strongest` candidate
pool; `strongest` uses strict `>` (first-listed wins ties). mapped: **D8 (resolve fold,
affinities)** + D18 (transform precedence: override vs delta — a granted affinity is an
*override*, later layer wins). The base-is-fallback-not-candidate rule is exactly the
kind of precedence D18 governs; D18 covers it in principle but does **not** call out the
"base excluded from candidate pool / strict `>` tie-break" specifics. mapped D8/D18;
flag the precise strongest-resolution rule for explicit preservation.

---

## G. Rank / mastery gates (`archetypes/rank.ts`)

**G1.** PRESERVE — `MASTERY_RANK = 5`; `hasMasteryBonus(rank)` = `rank >= 5` (`>=`
boundary; derived, never stored). mapped: D15 (PRESERVE the numeric/ordering gates) +
D23/H1. Zero-dependency predicate; carries over directly (D2 derive-math carry-over).

**G2.** PRESERVE — `hasUnlockedRank(currentRank, requiredRank)` = `currentRank >=
requiredRank`; `>=` boundary; zero-dependency. mapped: D15 + D2. The single rank-gate
predicate behind Rank-keyed Skills, Synthesis, inheritance (D1/A10). The prompt's named
PRESERVE (rank/mastery `>=` gates). Carries over directly.

---

## H. Composition root (`create-engine.ts` — `createGameEngine`)

**H1.** SUPERSEDE — `createGameEngine` binds an **exact** set of v1 boundary functions
(the listed 23 methods), asserted by `EXPECTED_METHODS`. mapped: **D23** —
"`game-engine.ts` is the engine boundary / composition root; the seam for slice-by-slice
migration." v2 keeps a composition root but the **method set changes**: v1 binds
`deriveHydratedCharacter`/`statblockFromEnemy`/`buildArchetypeEntries` over the
`HydratedCharacter`/`Statblock`/`CombatantRef` shapes, which D2/D8 dissolve into
`resolve(entity) → ResolvedStatblock` over components. So the *contract exists* (D23) but
the *exact key set is deliberately replaced* — the v1 `EXPECTED_METHODS` list is not the
v2 list. SUPERSEDE: D23 (composition root preserved as concept; bound method set
changes with the component/resolve model). **Flag: D23 is a "sketch, refines as built"
— it does not enumerate the v2 boundary method set, so H1's exact-set contract has no
v2 counterpart yet.**

**H2.** PRESERVE — each boundary fn bound **deps-first** (`GameData` adapter to every
outer call; `newId` to id-minting ones); no logic in factory; one uniform sweep.
mapped: **D23** (verbatim: "createGameEngine is one uniform sweep of those outer calls;
the composition root binds gameData once"). Directly preserved.

**H3.** PRESERVE — `newId` defaults to `crypto.randomUUID`; minted id is non-empty
string. mapped: D23. Carried convention.

**H4.** PRESERVE — injected `newId` threaded into id-minting boundary functions.
mapped: D23. Carried convention (testability seam).

**H5.** PRESERVE — factory closure (no class/`this`); destructuring safe;
`reduceMapInstance`/`createMapInstance`/`createCombatSession` take **only** `newId`;
`reduceMapGeometry` + `reduceDungeon` are **NOT bound** (used directly, no GameData/newId
dep). mapped: D23. **Note the carve-out: `reduceMapGeometry` (the map-template geometry
reducer, section J) and `reduceDungeon` sit *outside* the composition root by design —
v2 must preserve that they remain un-injected, ids-on-events reducers. The decision log
mentions `reduceDungeon` (D14 context) and `reduceMapInstance` but never `reduceMapGeometry`
— see section J flag.**

---

## I. Setup placement predicate (`encounter/setup-roster-view.ts`)

**I1.** PRESERVE — `isRosterFullyPlaced` true for an unzoned encounter
(`zones` empty) — theater-of-mind always placed. mapped: D21 (action-economy / encounter
setup is in scope) + Position component (O1). The predicate itself is unnamed in the
design. mapped to O1 Position / encounter scope; flag as undescribed.

**I2.** PRESERVE — with zones present, true only when every combatant's `zoneId` is a
key in `zones`; false on unplaced or dangling zone ref. mapped: O1 Position component
(zone/token ref) + D21 setup. Referential-convention rule (zone ids not schema-enforced)
must be reproduced. Design silent on this predicate specifically.

---

## J. Map-template geometry reducer (`map/reduce-map-geometry.ts`)

**Threshold finding (prompt-flagged):** The **map-geometry template reducer
(`reduceMapGeometry`) is essentially unmentioned in the engine-v2 design.** The decision
log discusses `reduceMapInstance` (bound in the composition root, H1) and `reduceDungeon`,
and D11 stores map blobs ("Object … session/map blob"), and MEMORY notes map-template vs
map-instance reducers exist — but **no D-entry covers the map-template geometry reducer's
behavior** (zone CRUD, connection CRUD, lowest-free-slot naming, same-ref no-op contract).
H5 even confirms `reduceMapGeometry` is deliberately *outside* the composition root, yet
no decision describes it. The reducer is a pure Immer decider — consistent with D6
(exhaustive-switch reducers) and the MEMORY "Immer by state-shape" note — so it would
**carry over from v1 essentially unchanged** (it is geometry, not participant/component
modeling, so the ECS-lite redesign barely touches it). **Classified PRESERVE throughout,
mapped to D6 (reducer style) as the only conceptual home, and flagged as a surface the
design never explicitly scopes.**

**J1.** PRESERVE — `addZone`: lowest-free `Zone N` (N≥1) name; empty desc/dmNotes;
re-parses; no input mutation. mapped: D6 (reducer style). **lowest-free-slot naming** is
the prompt's named PRESERVE. Undescribed in design.

**J2.** PRESERVE — `duplicateZone`: copies text to new id/position, `" copy"` suffix; no
connections carried; same-ref no-op on unknown source. mapped: D6.

**J3.** PRESERVE — `renameZone`: trims; no-op on empty/whitespace or unknown id. mapped:
D6.

**J4.** PRESERVE — `setZoneText`: independent `description`/`dmNotes` patch; no-op on
unknown id. mapped: D6.

**J5.** PRESERVE — `moveZone`: updates position; no-op on unknown id. mapped: D6.

**J6.** PRESERVE — `deleteZone`: removes zone, cascades all incident (undirected)
connections; no-op on unknown id. mapped: D6.

**J7.** PRESERVE — `addConnection`: undirected, `hidden/locked` false defaults; no-op on
self-loop / unknown endpoint / duplicate (either direction). mapped: D6.

**J8.** PRESERVE — `setConnectionFlag`: independent `hidden`/`locked`; no-op on unknown
id. mapped: D6.

**J9.** PRESERVE — `deleteConnection`: by id; no-op on unknown id. mapped: D6.

**Cross-cutting J:** PRESERVE — every edit re-parses against `mapGeometrySchema`;
unknown-id edits return the **same reference** (`next === geometry`) for the canvas
short-circuit. mapped: D6 + MEMORY "Immer preserves the no-op same-ref contract." Exact
contract to reproduce; design silent.

---

## K. Map geometry warnings (`map/geometry-warnings.ts`)

Same threshold finding as J — **unmentioned in the design.** Non-blocking pure
validations; carry over with the geometry reducer. mapped: D6-adjacent (pure geometry
functions), no explicit home.

**K1.** PRESERVE — `disconnectedZoneIds`: `[]` until ≥2 zones; flags every zone with no
incident connection; `[]` when all connected. mapped: (none explicit) — geometry helper,
undescribed.

**K2.** PRESERVE — `duplicateZoneNames`: one representative per colliding name group,
trimmed+lowercased compare; skip empty/whitespace; `[]` when distinct. mapped: (none
explicit) — geometry helper, undescribed.

---

## Totals

- **PRESERVE: 55** (A1–A13, B1–B11, C1–C11, D1–D2, E1–E2, G1–G2, H2–H5, I1–I2, J1–J9, K1–K2)
- **SUPERSEDE: 1** (H1 — composition-root method set replaced by the component/resolve model under D23)
- **GAP: 0** hard gaps (no requirement is *inexpressible*), but **several PRESERVE items
  are accounted-for-only-by-existence** (D23/H1 bind the function; D6 covers the reducer
  style) with the *surface's re-homing onto the component model left undescribed.* These
  are flagged inline and consolidated below as "design-silent" risks rather than true
  gaps.

### Design-silent risks (not inexpressible, but undescribed — must be consciously preserved)

1. **The Lineage Atlas as a surface has no design home** beyond H1 binding
   `buildLineageAtlas`/`getAtlasRecommendations`. It is a progression projection over
   catalog + owned rows, NOT derivable off `ResolvedStatblock`. Inputs re-home (StatProfile
   recipe D11, Inheritance D19), but the builder/recommender logic is undescribed by any
   D-entry. (Sections A, B.)
2. **Atlas prerequisite gating** (A10/A11) and **recommendation sort orders** (B4–B6/B8)
   are exact rules with the inventory's own dual-encoding drift flag (B8); no decision
   addresses consolidation.
3. **`hiddenArchetypeKeys`** (A4) is a catalog pre-filter by viewer identity — conceptually
   adjacent to D20 visibility but a *different* mechanism (pre-shaping vs resolved-statblock
   redaction); the design connects neither.
4. **`activeArchetypeId`** (C2/C6) — the active-archetype selection pointer — has no named
   field in the v2 entity/component model (O1/D11).
5. **Inheritance slot read-side validity** (C5) — `isValid`/stale-slot surfacing — is not
   covered by D19, which describes inheritance only as a resolve pass-through layer, not the
   slot-validity read rule. D19 *does* support inheritance-through-forms (full pass-through,
   layer 3 inert to form swaps) — confirmed — but the Inheritance component's slot-validity
   rules are unrestated.
6. **Affinity strongest-resolution specifics** (E2): base-excluded-from-candidate-pool +
   strict `>` tie-break sit under D8/D18 in principle but are not explicitly named.
7. **The map-template geometry reducer (`reduceMapGeometry`) and its warnings** (J, K) are
   **not scoped by any decision.** H5 confirms `reduceMapGeometry` stays *outside* the
   composition root (un-injected, ids-on-events) but no D-entry describes its behavior. It
   carries over under D6's reducer style + the MEMORY same-ref/Immer contract, but the
   design never says so.
8. **H1's exact-method-set contract has no v2 counterpart** — D23 is an explicit sketch and
   does not enumerate the v2 boundary method set, so the v1 `EXPECTED_METHODS` list cannot
   yet be checked against v2.
