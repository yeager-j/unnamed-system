# 06 — Atlas, Inheritance, Archetype Display, Affinity, Rank Gates, Composition Root, Setup Placement, Map Geometry

A gap-filling requirements inventory for engine modules the first four extractors
missed. Pure inventory of **what the engine guarantees** — testable behavior,
rules, invariants. No keep/modify/drop tags, no v2 design.

Each requirement: a one-line testable statement, the `source:` file+function, and
an `edge:` note on boundaries, gating, ordering, null/empty, and fallbacks. Folds
in the precise rules named in `_gaps-from-tests.md` (§1e/1f/1g, 3a/3b/3c, CE-1) and
`_gaps-from-source.md` (G1-ATLAS-*, G1-INH-*, G1-AFF-1, G1-RANK-1, G1-STAT-2,
G3-MAP-1, G3-WARN-1).

---

## A. Lineage Atlas (`archetypes/atlas.ts`)

**A1.** `buildLineageAtlas` lists **all twelve Lineages in canonical `LINEAGES`
order**, one `AtlasLineage` per Lineage, regardless of whether the character owns
anything in them.
`source:` atlas.ts `buildLineageAtlas`.
`edge:` order is the foundation `LINEAGES` array verbatim.

**A2.** Each Lineage carries **exactly four tier columns in fixed order**:
`initiate`, `adept`, `elite`, `paragon` (the `ARCHETYPE_TIERS` order). A tier with
no Archetypes is an empty column (length 0), not omitted.
`source:` atlas.ts `buildLineageAtlas` (`columns: ARCHETYPE_TIERS.map(...)`).

**A3.** Within a Lineage, catalog Archetypes are sorted **by key** (`localeCompare`);
the column projection then re-buckets them into tier columns. A node lands in the
column matching `archetype.tier`.
`source:` atlas.ts `buildLineageAtlas`.
`edge:` the per-Lineage sort is key-only — tier order comes solely from the column
filter, never a tier sort. Two same-tier Archetypes appear in key order within their
column.

**A4.** `hiddenArchetypeKeys` (default empty) **drops the named Archetype keys from
the catalog before any shaping** — they appear in no column and don't count toward
`total` or `unlockedCount`.
`source:` atlas.ts `buildLineageAtlas`.
`edge:` filter happens first, on `archetype.key`; the app layer (viewer identity)
decides the keys, the engine is a pure key filter.

**A5.** An owned Archetype's node carries `state: { kind: "owned", rank }` (below
mastery) or `{ kind: "mastered", rank }` (at mastery), its `characterArchetypeId`
set to the owning row id, and bumps that Lineage's `progress.owned`.
`source:` atlas.ts `buildLineageAtlas` + `atlasNodeState`.
`edge:` `progress = { owned, total }`; `owned` counts nodes with a non-null
`characterArchetypeId`, `total` is the Lineage's node count.

**A6.** An owned row whose `archetypeKey` is **not in the catalog** is ignored — it
does not contribute to `unlockedCount` or any Lineage's progress.
`source:` atlas.ts `buildLineageAtlas` (`if (byKey.has(row.archetypeKey))`).
`edge:` data-drift after a deploy; silently dropped, never throws.

**A7.** Each node's `parentKeys` is its Archetype's prerequisites' `archetype` keys
(empty for a prereq-less Archetype) — the tree's parent→child connection links.
`source:` atlas.ts `buildLineageAtlas`.

**A8.** `originLineage` resolves **only from the row whose id equals
`originCharacterArchetypeId`** (then that row's Archetype's Lineage); `null` when no
origin row is set, the origin row points at an unknown Archetype, or there's no
origin id.
`source:` atlas.ts `buildLineageAtlas`.
`edge:` not "any owned row" — must be the matching origin row. `isOrigin: true` is
stamped on exactly the matching Lineage entry, falsy on all others.

**A9.** `LineageAtlasView` passes through `savedRanks` (= `savedArchetypeRanks`) and
`unlockedCount` (= count of catalog-resolvable owned rows).
`source:` atlas.ts `buildLineageAtlas`.

### A.10 `unmetPrerequisites`

**A10.** `unmetPrerequisites(archetype, ownedRankByKey)` returns the prerequisites
**not yet met, in declaration order**. A prereq `{archetype, rank}` is met when
`(ownedRankByKey.get(prereq.archetype) ?? 0) >= prereq.rank`.
`source:` atlas.ts `unmetPrerequisites`.
`edge:` `>=` boundary (owned rank exactly equal to required ⇒ met). Returns `[]`
when all met; returns the prereq both when owned-rank is too low and when the parent
is unowned (defaults to 0). `ownedRankByKey` counts only catalog-resolvable owned rows.

### A.11 `atlasNodeState`

**A11.** `atlasNodeState(archetype, ownedRank, ownedRankByKey)`:
- `ownedRank !== null` + `hasMasteryBonus(ownedRank)` ⇒ `{ kind: "mastered", rank }`
- `ownedRank !== null` below mastery ⇒ `{ kind: "owned", rank }`
- unowned (`ownedRank === null`) with unmet prereqs ⇒ `{ kind: "locked", unmetPrerequisites }`
- unowned, all prereqs met ⇒ `{ kind: "unlockable" }`

`source:` atlas.ts `atlasNodeState`.
`edge:` **owned state wins over the prerequisite check** — an owned Archetype is
never "locked" even if its prereqs are no longer met. Mastery boundary is `rank >= 5`
(see G).

### A.12 `isAtlasNodeUnlocked` / `filterAtlasLineagesToUnlocked`

**A12.** `isAtlasNodeUnlocked(node)` is `true` for `owned`/`mastered`, `false` for
`unlockable`/`locked`.
`source:` atlas.ts `isAtlasNodeUnlocked`.

**A13.** `filterAtlasLineagesToUnlocked(lineages)` keeps only owned/mastered nodes in
each column and **drops Lineages left with no nodes**, but leaves each surviving
Lineage's `progress` counts untouched.
`source:` atlas.ts `filterAtlasLineagesToUnlocked`.
`edge:` returns `[]` when nothing is unlocked; progress still reads original
`owned/total` even though columns are now filtered.

---

## B. Atlas recommendations (`archetypes/atlas.ts` — `getAtlasRecommendations`)

**B1.** `getAtlasRecommendations(view, pathChoice, level)` returns **0–3** filled
slots (`AtlasRecommendation[]`), never more than 3, never repeating an Archetype key.
`source:` atlas.ts `getAtlasRecommendations`.

**B2.** **Level-ceiling gate:** returns `[]` when `savedRanks === 0 && level >= MAX_LEVEL`.
A character at the level ceiling *with* saved ranks still gets recommendations; a
character below the ceiling with zero saved ranks still gets them (planning mode).
`source:` atlas.ts `getAtlasRecommendations`.
`edge:` the only place saved-ranks gates the list. The gate is `>=` on `MAX_LEVEL`,
`=== 0` on `savedRanks`; both conditions must hold to return empty.

**B3.** Only **actionable** nodes are recommendable: `unlockable` (fresh) or `owned`
(rank-up). `locked` and `mastered` nodes are never surfaced.
`source:` atlas.ts `isRecommendable`.

**B4. Slot 1 — Origin pick:** the best actionable node in the **origin Lineage**
fills slot 1, badged `reason: "origin-lineage"`. Sorted by:
`tierRank` (lower tier first) → `actionRank` (owned/rank-up=0 before fresh-unlock=1)
→ Archetype key (`localeCompare`).
`source:` atlas.ts `getAtlasRecommendations` (`originPick`), `tierRank`, `actionRank`.
`edge:` **tier leads** action — a fresh lower-tier Initiate beats an owned higher-tier
Adept in the origin Lineage. Tie-break order is tier → action → key. When the origin
Lineage offers no actionable node (or there is no origin Lineage), slot 1 is skipped
and the fill pool provides every slot.

**B5. Slots 2–3 (and slot 1 when origin is exhausted) — fill pool**, sorted by:
`fillPriority` → `actionRank` → `tierRank` → key.
`source:` atlas.ts `getAtlasRecommendations` (`fillCandidates`), `fillPriority`.
`edge:` excludes the already-used slot-1 Archetype; caps the total at 3.

**B6. `fillPriority` buckets (lower wins, strict ordering):**
- `0` — Lineage the character has already invested a Rank in (`ownedInLineage > 0`),
  **regardless of Path** → reason `unlocked-archetype`
- `1` — untouched Lineage whose `LINEAGE_SUGGESTED_PATH` matches the character's Path
  → reason `fits-path`
- `2` — off-Path Lineage that teaches a damage type the character lacks
  → reason `new-damage-type` (UNN-277), lowest priority

`source:` atlas.ts `fillPriority`, `toRecommendation`.
`edge:` the in-progress check is `> 0` (not `>= 0`), so an in-progress Lineage sorts
strictly ahead of an untouched on-Path one even when tier/action/key would favor the
latter. A `new-damage-type` pick ranks strictly below a `fits-path` pick.

**B7. Fill-pool eligibility filter:** a non-origin candidate enters the pool only if
`ownedInLineage > 0` OR its Lineage is on-Path OR it `introducesNewDamageType`. An
**untouched, off-Path Lineage adding no new damage type is never surfaced**.
`source:` atlas.ts `getAtlasRecommendations` (`fillCandidates` filter).

**B8. Reason assignment** (`toRecommendation`) is independent of pool sort and keyed
in this precedence: origin Lineage ⇒ `origin-lineage`; else in-progress
(`ownedInLineage > 0`) ⇒ `unlocked-archetype`; else on-Path ⇒ `fits-path`; else
`new-damage-type`.
`source:` atlas.ts `toRecommendation`.
`edge:` an on-Path Lineage that *also* adds a new damage type is still badged
`fits-path` (the on-Path branch wins). `origin-lineage` precedence means an origin
node that is also in-progress is badged `origin-lineage`, not `unlocked-archetype`.

**B9. New-damage-type detection:** `archetypeDamageTypes(archetype, getSkill)` collects
the `damageType` of each of the Archetype's Skills, **skipping the `"special"` bucket
and every non-`attack` Skill** (heal/support/ailment/passive carry no damage type).
A Skill reference whose key doesn't resolve in the catalog contributes nothing
(short-circuits, never throws).
`source:` atlas.ts `archetypeDamageTypes`.
`edge:` `"special"` is multi-element / not a single resistible type, so it never
counts as new coverage.

**B10.** `accessibleDamageTypes(view, getSkill)` is the **union of attack damage types
over every unlocked (owned/mastered) node** on the view — the baseline a candidate's
new-coverage is measured against.
`source:` atlas.ts `accessibleDamageTypes`.
`edge:` `introducesNewDamageType` is true when any of a candidate's
`archetypeDamageTypes` is absent from this set.

**B11.** `getAtlasRecommendations` is curried deps-first: outer takes the
`Pick<GameData, "getSkill">` slice, inner takes `(view, pathChoice, level)`.
`source:` atlas.ts `getAtlasRecommendations`.

> **Ambiguity flag (factual):** The fill sort uses `fillPriority` (which is itself
> derived from `ownedInLineage`/on-Path/new-damage-type) as the primary key, while
> `toRecommendation` independently recomputes the *reason* from the same inputs in a
> slightly different precedence (reason puts the origin check first; `fillPriority`
> never sees origin candidates because they're filtered out of the fill pool by
> `used`). These stay consistent for the fill pool but are two separate code paths
> encoding overlapping logic — a v2 must keep them in lockstep. Not a behavior gap;
> flagged because the dual encoding is easy to drift.

---

## C. Archetype display & preview (`archetypes/utils.ts`)

### C.1 `buildArchetypeEntries`

**C1.** `buildArchetypeEntries(character, context?)` returns **one `ArchetypeEntry`
per resolvable Archetype row, in row order**; a row whose `archetypeKey` no longer
resolves to a catalog entry is skipped.
`source:` utils.ts `buildArchetypeEntries`.

**C2.** Each entry flags `isActive: row.id === character.activeArchetypeId`.
`source:` utils.ts `buildArchetypeEntries`.

**C3.** Each entry's `ranks` is one `RankedSkill` per Rank-keyed Skill the Archetype
declares (carrying `{ ...hydratedSkill, rank }`); references whose Skill key doesn't
resolve are dropped. `synthesis` is the resolved Synthesis Skill (`{ ...skill, rank }`)
or `null` when the Archetype declares none.
`source:` utils.ts `resolveArchetypeRankedSkills`, `buildArchetypeEntries`.

**C4.** Skill costs/attack-rolls resolve against the **live character's** stats
(`toStatContext(character)`), `character.maxHP`, and the supplied
`context.partyComposition` (or `null`).
`source:` utils.ts `buildArchetypeEntries`.
`edge:` with no combat context, a `perPartyLineage` passive contributes no scaling;
when `context.partyComposition` is supplied, the passive scales the relevant Skill's
attack roll by the party count (e.g. `{ mage: 3 }` adds +3 and a `Magic Circle`
source with `amount: 3`).

**C5. Inheritance-slot resolution** — one `ResolvedInheritanceSlot` per
`row.inheritanceSlots` entry (length preserved, `slotIndex` carried):
- `sourceArchetype` = the Archetype of the row at `sourceCharacterArchetypeId`, or
  `null` (empty slot, or source row gone).
- `resolved` = the hydrated filling Skill, or `null` (empty slot, or `skillKey` no
  longer resolves).
- `isValid`:
  - **empty slot (`skillKey === null`) ⇒ always `true`** (with `resolved`/`sourceArchetype`
    `null`).
  - configured slot ⇒ `true` **only when** the source Archetype resolves **AND**
    `isInheritableSkill(sourceArchetype, sourceRow.rank, skillKey)`.

`source:` utils.ts `buildArchetypeEntries` (slot map).
`edge:` a configured slot is **invalid** when (a) the source row no longer exists, (b)
the source's current Rank no longer unlocks the picked Skill (rank dropped below the
skill's required rank), or (c) the `skillKey` doesn't resolve. The flag lets the read
side surface a stale slot rather than silently dropping it; the picker prevents
*writing* an invalid one.

### C.2 `getArchetypeDisplay`

**C6.** `getArchetypeDisplay(character, context?)` returns
`{ activeEntry }` — the entry flagged `isActive`, or `null` when no row is active.
`source:` utils.ts `getArchetypeDisplay`.

### C.3 `previewArchetypeSkills`

**C7.** `previewArchetypeSkills(archetype, pathChoice)` resolves the Archetype's
Rank-keyed Skills and Synthesis Skill into `{ ranks, synthesis }` against a
**synthetic Rank-2, equipment-less, single-Archetype** StatContext carrying the
player's already-picked `pathChoice`.
`source:` utils.ts `previewArchetypeSkills`.
`edge:` one RankedSkill per declared Skill (ranks preserved); drops a reference whose
key doesn't resolve; a passive's `resolvedAttackRoll` is `null`; synthesis resolves
alongside or is `null` when undeclared. Rank 2 is the Origin's auto-rank (PRD §5.1),
below every Mastery rank — so the preview shows concrete readouts (`"1 HP"`,
`"Attack Roll +2"`) instead of percent placeholders.

### C.4 `archetypeSwitcherGroups`

**C8.** `archetypeSwitcherGroups(character)` groups **unlocked Archetypes by Lineage**,
in canonical `LINEAGES` order; Lineages with no unlocked Archetype are omitted; a row
whose key doesn't resolve is skipped.
`source:` utils.ts `archetypeSwitcherGroups`.

**C9.** Each option carries `{ id (row id), name, tier, rank (row rank), mechanicName }`.
`mechanicName` is the resolved Mechanic's `displayName`, or `null` when the Archetype
declares no Mechanic.
`source:` utils.ts `archetypeSwitcherGroups`.

**C10.** Options within a Lineage group are sorted by **tier then name**; every
unlocked row of one Lineage stays in that Lineage's single group.
`source:` utils.ts `archetypeSwitcherGroups`.
`edge:` resolves only catalog facts (no Skill/inheritance work) since it sits on every
owner sheet.

### C.5 `sortArchetypesByPath`

**C11.** `sortArchetypesByPath(archetypes, pathChoice)` returns a **new array** (no
input mutation) sorted into three Path buckets whose order rotates with the picked
Path:
- `health-focused` → `health, balanced, skill`
- `balanced` → `balanced, health, skill`
- `skill-focused` → `skill, balanced, health`

Within a bucket, ties fall back to **canonical `LINEAGES` order**.
`source:` utils.ts `sortArchetypesByPath`, `BUCKET_ORDER_BY_PATH`.
`edge:` a Lineage's bucket comes from `LINEAGE_SUGGESTED_PATH[lineage]`. The sort is
discovery-only — it never gates selectability (every Archetype stays selectable
regardless of Path).

---

## D. Inheritance source resolution (`archetypes/inheritance.ts`)

**D1.** `isInheritableSkill(source, sourceRank, skillKey)` is `true` iff the source
Archetype declares a Rank-keyed Skill with that key whose required rank the source has
unlocked (`hasUnlockedRank(sourceRank, reference.rank)`).
`source:` inheritance.ts `isInheritableSkill`.
`edge:` **Synthesis Skills are excluded by construction** — they live on
`synthesisSkill`, not `skills`, so they never match. A Skill above the source's current
Rank is rejected (`>=` gate). A Skill the source doesn't declare is rejected.

**D2.** `inheritanceSourceGroups(entries, ownerRowId)` returns one
`InheritanceSourceGroup` per **other** unlocked Archetype (the owner's own row is
excluded), each carrying `{ sourceCharacterArchetypeId, archetype, rank,
skills }` where `skills` = that source's `ranks` filtered to those unlocked at its
current Rank.
`source:` inheritance.ts `inheritanceSourceGroups`.
`edge:` a source whose Skills are **all over-rank** (zero available) is dropped; a
source with ≥1 in-rank Skill is kept. Reuses the already-resolved
`ArchetypeEntry.ranks` (Synthesis never appears there), so no catalog/cost work repeats.

---

## E. Affinity base resolution (`archetypes/affinity.ts`)

**E1.** `resolveAffinity(archetype, damageType)` returns `"neutral"` for `"almighty"`
**unconditionally** (Almighty cannot be resisted), and `archetype.affinities[damageType]
?? "neutral"` for every other type — any damage type **absent from the chart is
Neutral**.
`source:` affinity.ts `resolveAffinity`.
`edge:` the `almighty` guard is also a type-narrowing necessity (the affinity chart
schema has no `almighty` key). A sparse chart never yields `undefined` — it falls back
to `"neutral"`.

**E2.** (Cross-ref, G1-STAT-2 — lives in `stats.ts`, owned by file `01`, restated here
because it governs Archetype-base affinity.) A **single granted Affinity candidate
replaces the Archetype base regardless of relative priority** — the base is **not** in
the `strongest` candidate pool; it is only the **zero-candidate fallback**. So a
`weak`-granting item overrides a `resist` base.
`source:` stats.ts `computeAffinityChart` / `strongest`.
`edge:` folding the base into the candidate set would let a high-priority base
out-prioritize a granted candidate — the opposite of intended. `strongest` uses `>`
(strict), so the first-listed wins ties.

---

## F. (reserved — see E2 cross-ref)

---

## G. Rank / mastery gates (`archetypes/rank.ts`)

**G1.** `MASTERY_RANK = 5`. `hasMasteryBonus(rank)` is `rank >= 5` (Mastery is "at
cap", derived from Rank, never stored).
`source:` rank.ts `hasMasteryBonus`, `MASTERY_RANK`.
`edge:` **`>=` boundary** — exactly Rank 5 is mastered; `>` would silently lock
Rank-5 mastery.

**G2.** `hasUnlockedRank(currentRank, requiredRank)` is `currentRank >= requiredRank` —
the single "you have it at Rank N if your Rank ≥ N" predicate behind Rank-keyed Skills,
Synthesis Skills, inheritance gating, and any future Rank-gated feature.
`source:` rank.ts `hasUnlockedRank`.
`edge:` **`>=` boundary** (current exactly equal to required ⇒ unlocked). This module
is zero-dependency so any layer can import it without cycling through the archetypes
domain.

---

## H. Composition root (`create-engine.ts` — `createGameEngine`)

**H1.** `createGameEngine(data, newId?)` returns an object binding **exactly** this set
of boundary functions, each callable: `deriveHydratedCharacter`, `toStatContext`,
`buildStatContext`, `reduceCharacter`, `getArchetypeDisplay`, `buildArchetypeEntries`,
`buildEnemyCatalogRows`, `resolveCatalogEnemyStatblocks`, `statblockFromEnemy`,
`reduceCombatSession`, `reduceMapInstance`, `endOfTurnObligations`, `buildLineageAtlas`,
`getAtlasRecommendations`, `archetypeSwitcherGroups`, `previewArchetypeSkills`,
`resolveTalentsForSheet`, `resolveTalentsForBuilder`, `equipItem`, `addItem`,
`setItemQuantity`, `createCombatSession`, `createMapInstance`.
`source:` create-engine.ts `createGameEngine`; create-engine.test.ts `EXPECTED_METHODS`.
`edge:` the test asserts the **exact** key set (not a subset) — a newly-bound method
without a test entry, or a removed one, fails.

**H2.** Each boundary function is bound **deps-first**: the factory passes the single
`GameData` adapter (`data`) to every function's outer call, plus `newId` to the
id-minting ones (`reduceCharacter`, `reduceCombatSession`, `reduceMapInstance`,
`createCombatSession`, `createMapInstance`). No logic lives in the factory — it is one
uniform sweep of outer calls.
`source:` create-engine.ts `createGameEngine`.

**H3.** `newId` **defaults to a real id generator** (`crypto.randomUUID`) when omitted —
a minted id is a non-empty string.
`source:` create-engine.ts (default param); create-engine.test.ts.

**H4.** An **injected `newId` is threaded into the id-minting boundary functions** —
e.g. `createGameEngine(data, () => "fixed-id")` mints `"fixed-id"` for a new
combatant.
`source:` create-engine.ts; create-engine.test.ts.

**H5.** It is a factory closure (no class/`this`/lifecycle), so destructuring the
result is safe.
`source:` create-engine.ts module doc.
`edge:` `reduceMapInstance`, `createMapInstance`, `createCombatSession` take **only**
`newId` (no `data`); `reduceMapGeometry` and `reduceDungeon` are NOT bound here (used
directly — they carry no `GameData`/`newId` dependency).

---

## I. Setup placement predicate (`encounter/setup-roster-view.ts`)

**I1.** `isRosterFullyPlaced(setups, zones)` is **`true` for an unzoned encounter**
(`Object.keys(zones).length === 0`) — theater-of-mind always counts as placed.
`source:` setup-roster-view.ts `isRosterFullyPlaced`.

**I2.** Once any zones exist, it is `true` only when **every combatant's `zoneId` is a
key in `zones`**, else `false`.
`source:` setup-roster-view.ts `isRosterFullyPlaced`.
`edge:` `false` when a combatant is unplaced (empty `zoneId` while zones exist) OR
references a zone id no longer in the geometry. It is the placement half of the
referential convention (zone ids are not schema-enforced on the combatant). Consumed
to gate Save-draft / Start-combat.

---

## J. Map-template geometry reducer (`map/reduce-map-geometry.ts`)

`reduceMapGeometry(geometry, event)` is a pure, Immer-drafted, exhaustive-switch
(no `default`) decider over `MapGeometry`. **Not curried** — ids ride on the events
(the canvas mints them), no `newId`/`GameData` injected. Every edit keeps the blob
valid against `mapGeometrySchema`. An unknown-id edit mutates no draft, so **Immer
returns the same reference** (`next === geometry`), which the canvas's `next === ref`
short-circuit relies on.
`source:` reduce-map-geometry.ts module doc + `reduceMapGeometry`.

### Zone events

**J1. `addZone`** inserts a zone at the event id/position with a **lowest-free
`Zone N` (N ≥ 1) default name** — it fills the lowest unused slot, not always counting
up (zones `Zone 1` + `Zone 3` ⇒ next is `Zone 2`). New zone has empty `description`
and `dmNotes`. Result re-parses against the schema; input is not mutated.
`source:` reduce-map-geometry.ts `addZone` case, `nextZoneName`.
`edge:` `nextZoneName` scans taken names and returns the first `Zone n` (n from 1) not
in use.

**J2. `duplicateZone`** copies the source zone's text (name/description/dmNotes) to a
new id and position, suffixing the name with **`" copy"`** (`"Vault"` → `"Vault copy"`);
the original is untouched. **No connections are carried over.** No-ops (same ref) on an
unknown `sourceId`. Result re-parses.
`source:` reduce-map-geometry.ts `duplicateZone` case.

**J3. `renameZone`** trims the new name and sets it; **no-ops on an empty/whitespace
trimmed name** (schema requires ≥1 char) and on an unknown zone id.
`source:` reduce-map-geometry.ts `renameZone` case.
`edge:` empty-rename no-op preserves the same-ref contract.

**J4. `setZoneText`** patches `description` and `dmNotes` **independently** (via
`Object.assign(zone, patch)` — only supplied keys change); no-ops on an unknown id.
`source:` reduce-map-geometry.ts `setZoneText` case.

**J5. `moveZone`** updates the zone's `position`; no-ops on an unknown id.
`source:` reduce-map-geometry.ts `moveZone` case.

**J6. `deleteZone`** removes the zone and **cascades every connection referencing it on
either endpoint** (connections are undirected); connections not touching the deleted
zone are kept; no-ops on an unknown id.
`source:` reduce-map-geometry.ts `deleteZone` case.

### Connection events

**J7. `addConnection`** inserts an undirected connection (`hidden: false, locked: false`
defaults) between two zones. **No-ops (same ref) on a self-loop, an unknown endpoint
(either side), or a duplicate** (an existing edge in *either* direction).
`source:` reduce-map-geometry.ts `addConnection` case, `connectionExists`.
`edge:` `connectionExists` checks both `(from,to)` and `(to,from)`.

**J8. `setConnectionFlag`** sets `hidden` or `locked` **independently** (`connection[flag]
= value`); no-ops on an unknown connection id.
`source:` reduce-map-geometry.ts `setConnectionFlag` case.

**J9. `deleteConnection`** removes the connection by id; no-ops on an unknown id.
`source:` reduce-map-geometry.ts `deleteConnection` case.

---

## K. Map geometry warnings (`map/geometry-warnings.ts`)

Pure, **non-blocking** validations (PRD FR-1: disconnected graph / duplicate names are
warnings the canvas shows, never blocks on autosave).

**K1. `disconnectedZoneIds(geometry)`** returns the ids of zones with **no incident
connection**. Returns `[]` until there are **≥2 zones** (a lone zone has nothing to
connect to). With ≥2 zones, flags every zone absent from the connected set; `[]` when
every zone has an edge.
`source:` geometry-warnings.ts `disconnectedZoneIds`.
`edge:` `< 2` zones short-circuits to `[]`; two unconnected zones flags both; a mixed
graph flags only the isolated one.

**K2. `duplicateZoneNames(geometry)`** returns **one representative per colliding name
group**, comparing names **trimmed + lowercased**; empty/whitespace-only names are
skipped; `[]` when all distinct.
`source:` geometry-warnings.ts `duplicateZoneNames`.
`edge:` `"Hall"` and `" hall "` collide and report a single `"Hall"` (the first-seen,
trimmed casing); multiple distinct collisions each report one representative.

---

## Summary

- **Requirement count:** 56 (A1–A13, B1–B11, C1–C11, D1–D2, E1–E2, G1–G2, H1–H5,
  I1–I2, J1–J9, K1–K2).
- **Concern groups (11):** Lineage Atlas; Atlas recommendations; Archetype
  display/preview; Inheritance source resolution; Affinity base resolution; Rank/mastery
  gates; Composition root; Setup placement; Map-template geometry reducer; Map geometry
  warnings. (Section F is a reserved cross-ref placeholder.)
- **Boundary rules captured:** `>=` mastery/rank gates (G1/G2, A10/A11); strict `>` in
  affinity `strongest` and base-is-fallback-not-candidate (E2); Atlas recommendation
  multi-key sort orders and the `> 0` in-progress primary key (B4–B6); lowest-free-slot
  `Zone N` naming (J1); same-ref no-op contract on every map-template edit (J);
  `<2`-zone short-circuit + trimmed/lowercased name collision (K); empty-slot-always-valid
  inheritance rule (C5/D1); origin-row-only Lineage resolution (A8); exact-method-set
  composition-root contract (H1).

### Places the Atlas prerequisite / recommendation logic seemed ambiguous (flagged factually)

1. **Dual encoding of fill priority vs. reason (B8 flag).** `fillPriority` and
   `toRecommendation` both derive from `{ownedInLineage, on-Path, introducesNewDamageType,
   origin}` but through separate code, with `toRecommendation` adding an origin-first
   precedence the fill pool never sees (origin candidates are filtered out by `used`).
   They agree today; a v2 must keep them in lockstep, since nothing structurally
   enforces it.

2. **`introducesNewDamageType` is computed per-candidate against `accessibleDamageTypes`,
   which is computed once over the *whole view's* unlocked nodes** — but a candidate is
   itself never unlocked (only `unlockable`/`owned`-below-mastery are recommendable, and
   `accessible` unions owned/mastered). The interaction is subtle: an *owned-below-mastery*
   candidate's own damage types ARE already in `accessible` (it's an unlocked node), so an
   in-progress rank-up never qualifies as `new-damage-type` for its own coverage — only
   fresh `unlockable` off-Path nodes can. This is consistent but non-obvious; no test
   isolates the owned-candidate-vs-its-own-coverage case.

3. **Prerequisite owned-rank map (`ownedRankByKey`) counts only catalog-resolvable owned
   rows** (A6/A10), so a prereq referencing an Archetype the viewer has hidden via
   `hiddenArchetypeKeys` would read as unowned (rank 0) and could lock a child. The hidden
   filter runs before `ownedRowByKey` is built, so a hidden parent makes its children
   permanently locked for that viewer. Likely intended (gated Archetypes hide their whole
   subtree) but not asserted by any test — flagged as a behavior a v2 should consciously
   preserve or revisit.
