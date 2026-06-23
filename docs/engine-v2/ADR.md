# ADR: Engine v2 — A Capability/Component Game Engine

**Status:** Accepted (design) · build not started
**Scope:** the core entity/combat engine (`@workspace/game-v2`). The Map-Instance
spatial subsystem is **explicitly out of scope** — see *Deferred*.
**Supersedes:** the design intent of `@workspace/game/src/engine` (v1).
**Supporting artifacts:** [`decision-log.md`](./decision-log.md) (chronological
rationale, D1–D29), [`requirements/`](./requirements/) (~440-requirement v1
behavior inventory + per-file PRESERVE/SUPERSEDE/GAP annotations),
[`requirements/_validation-gaps.md`](./requirements/_validation-gaps.md),
[`requirements/encounter-write-architecture.md`](./requirements/encounter-write-architecture.md).

> This ADR is the **clean current-state synthesis**. Where it cites `D<n>`, the
> chronological reasoning (including reversals) lives in the decision log.

---

## 1. Context

The v1 engine is pure and dependency-injected, but its participant types are
**nominal**, not composable. Two artifacts prove the pain:

1. **`CombatantRef` is a closed discriminated union** (`pc | enemy | catalog-enemy`).
   Every new participant — an NPC ally that equips items, a summon with a Mechanic,
   a destructible object — forces a new union arm.
2. **`Statblock` is a post-hoc unification** computed by two converging functions
   (`statblockFromCharacter` / `statblockFromEnemy`); its own doc admits "a PC and
   an enemy are the same thing… they differ only in provenance," yet the union still
   leaks (*"catalog enemies have no SP"*).

Three near-term requirements have no clean home in v1: a **Shapechanger** Lineage
(forms that change attributes/affinities/skills/maxHP), **enemy Mechanics**
(Nyx-style Arcana swaps), and the **Merchant/Usury** mechanic (an enemy whose
current HP may exceed its maximum). All three are blocked by the nominal model.

**Decision:** model every participant as an **entity composed of capability
components**, so engine functions declare the capabilities they need and *any*
entity carrying them qualifies — PC, enemy, NPC, or object — with zero `kind`
branches (D1).

---

## 2. Decision

### 2.1 Entities and capabilities (D1, D16)

An entity is a bag of named components. A single `ComponentRegistry` is the source
of truth; `Entity`, capability views, and runtime guards all derive from it.

```ts
type ComponentRegistry = { identity: Identity; vitals: Vitals; skillPool: SkillPool; /* … */ }
type Entity = { id: string; components: Partial<ComponentRegistry> }
type Has<K extends keyof ComponentRegistry> = Entity & { components: Pick<ComponentRegistry, K> }

const guard = <K extends keyof ComponentRegistry>(...keys: K[]) =>
  (e: Entity): e is Has<K> => keys.every((k) => e.components[k] !== undefined)
```

Structural intersection types (`Has<"vitals" | "skillPool">`) give function authors
precise capability requirements; a **`guard` factory** bridges to runtime — the
returned function carries its type predicate (a plain wrapper would erase it), and
it is multi-key so a system narrows *once* at the boundary. Express each system's
requirement as a key tuple and derive the guard *and* the view from it so they
can't drift (D16). Structural typing is compile-time only — the guard layer is how
a jsonb-loaded entity is narrowed at runtime (D4). The `guard` checks component
**presence**, not shape; **shape is validated once at the load seam** (Zod per
component on deserialization), so presence-guarding downstream is sound (F6).

### 2.2 Component catalog, by lifecycle (O1, refined by D13/D19/D25/D26/D27/D29)

**Lifecycle is the organizing axis** — it determines where a component is stored
and whether combat clears it.

| Component | Shape | Capability | Lifecycle |
|---|---|---|---|
| **Identity** | `{ name }` | — | durable (id is the entity key §2.1, not component content) |
| **Vitals** | `{ damage; max: MaxSource }` | `Targetable` | durable* |
| **SkillPool** | `{ spSpent; max: MaxSource }` | `CastingCombatant` | durable* |
| **Attributes** | `{ source: derived \| flat-scores }` | base of `resolve` | durable |
| **Affinities** | `{ source: derived \| flat-chart }` | base of `resolve` | durable |
| **Skills** | own component / resolved output (not a "stat") | grants skills | durable |
| **Resources** | `{ hitDiceUsed; skillDiceUsed; prismaUsed }` | consumable spend-pools | durable |
| **Exhaustion** | `{ level }` (0–6) | — | durable (separate from Resources — a level, not a spend-pool; F5) |
| **Mechanics** | `{ states: Record<MechanicKey, MechanicState> }` | runtime transforms | durable |
| **Equipment** | `{ slots / items }` | wields/wears | durable |
| **Archetypes** | `{ active; origin; roster: [{ key; rank; inheritanceSlots }] }` | archetype roster + inheritance config (D36) | durable (PC) |
| **Progression** | `{ level; pathChoice }` | derive inputs (presence ⇒ derived) | durable (`level` also a column) |
| **ManualBonuses** | `{ … }` (sparse) | derive input | durable |
| **Allegiance** | `{ side }` | combat membership | encounter-overlay |
| **TurnState** | `{ movesUsed; standardsUsed; reactionsUsed; turnsTakenThisRound }` | acts in initiative | encounter-overlay |
| **Ailments** | overlay | — | encounter-overlay |
| **BattleConditions** + **ConditionDurations** | overlay | — | encounter-overlay |
| **Counters** | named counters (Lumina) | — | encounter-overlay |
| **Position** | `{ zone / token ref }` | `Positioned` | spatial (Tier 3) |
| **Engagement** | `{ free } \| { engaged; targetCombatantIds }` | melee-lock | spatial (Tier 3) |

\* `Vitals`/`SkillPool` are durable for a PC/NPC (wounds persist), inline-ephemeral
for a catalog enemy — see §2.6.

Each **derivable** capability carries its own `source` —
`MaxSource = { kind:"derived" } | { kind:"flat"; value }` (and the analogous
`scores`/`chart` for Attributes/Affinities). This is **value provenance** (D5 — "how
is this number computed"), the *allowed* discrimination, not entity-kind. There is
**no `StatProfile` aggregate** (D34): maxHP lives on `Vitals`, maxSP on `SkillPool`
(presence is the capability — no optional `maxSP?`), and Skills is its own
component, not a "stat." A form swap **overrides** these per-capability components
from its catalog definition; the swap-bundle cohesion lives in the form definition,
not a component.

**Column vs component is a storage projection, not a runtime concept** (D35). At
runtime the entity *is* its components; `id` is the only top-level field. The rule:

- **column only** — app/query metadata no engine fn reads (`shortId`, `ownerId`,
  `campaignId`, `status`).
- **column + lifted into a component at load** — engine-read *and* queryable
  (`level` → `Progression`).
- **component (jsonb) only** — engine-read, not queried (`pathChoice`,
  `manualBonuses`, `damage`, mechanic state).

So `resolve` reads `entity.components.progression.level`, never a top-level
`entity.level`; the column is just the queryable storage form (D11 projection).
Rule of thumb (D13): *anything that must survive a form swap is its own component —
never an overridden capability.*

**Passive skills are not a component** — they're a resolved output of
archetype ∪ equipment ∪ inheritance (D19).

### 2.3 `resolve`: a layered fold (D5, D8, D18)

Effective stats are **computed, never stored**. `resolve(entity) → ResolvedEntity`
is **`Entity → Entity` (authored → effective)**: it emits resolved **capability
components**, not a single struct — a flat `ResolvedStatblock` would be a god
object that every consumer couples to, re-importing v1's `Statblock` and violating
this section's own read-granularity principle (D30). A `ResolvedComponentRegistry`
holds only *derived* read-units — `attributes`, `vitals {currentHP, maxHP}`,
`skillPool {currentSP, maxSP}`, `affinities`, `skills`, `attack` — narrowed with the
same guard machinery (§2.1); `applyDamage` reads resolved `vitals`, a renderer reads
whatever's present. Resolved vitals expose `currentHP` (derived), **not** authored
`damage` — so no authored field smears into the resolved type (F3).

The fold is a transform stack over a base — it runs **one pass** (it's
cross-cutting: a form touches several stats at once), producing the full resolved
set; only the *interface* is per-capability (compute-once, expose-narrowly — no
runtime cost). `ComponentRegistry` (authored/stored) and `ResolvedComponentRegistry`
(computed) are distinct but overlapping; reads consume the `ResolvedEntity`, writes
target authored components then re-resolve. Layers:

1. **Base capabilities** — each derivable component's `source` (D5/D34): `derived`
   (PC: from archetype + path + level) or `flat` (enemy: authored value, inline or
   from its catalog definition). This per-component source is what collapses the two
   `statblockFrom*` functions into one path — no `StatProfile` aggregate.
2. **Active form / Arcana** — when a form-swap Mechanic is active, *overrides* the
   base capabilities (attributes/affinities/skills/`vitals.max`/natural attack) from
   the form's catalog definition. The form swap touches **only this layer**.
3. **Inheritance** — inherited skills (slots read from `Archetypes`, D36) pass
   through a form **fully** (D19).
4. **Equipment** — granted skills + passive bonuses pass through **fully**; only the
   weapon *basic attack* is replaced by the form's natural attack (D22).
5. **Mechanic deltas** — `effects()` contributions.
6. **Combat overlay** — ailments/battle conditions; temporary, applied last.

Transforms are **override** (later layer wins — affinity/skill/maxHP swaps) or
**delta** (additive — buffs). Whether a specific buff stacks/caps is an
**effect-data rule**, not engine logic, keeping resolution deterministic (D18).
Shapechanger and Nyx are the *same* code path — only the base layer's `source`
differs.

### 2.4 Vitals as depletion (D9, D10, D26)

Store **depletion**, derive current. `currentHP = max(0, maxHP − damage)`; `damage`
is a **signed** integer.

- Because `maxHP` is resolved (and form-mutable), a form swap moves the ceiling
  under a form-independent `damage` invariant — **no HP-reconciliation policy
  needed** (D9). "Fallen" is `damage ≥ maxHP`.
- **Signed** `damage` makes **over-max HP** (Merchant/Usury's loaned HP) simply
  negative damage — no temp-HP buffer, no max inflation; `maxHP` stays honest for
  `%`-of-max and threshold rules (D10).
- **Storage is unbounded; each *operation* owns its clamp** — a normal heal floors
  `damage` at 0, a loan may push it negative, a skill's HP cost is strict-`>` (never
  self-Fall), SP is `>=` (D10, preserving v1's comparators).
- This is the **universal consumable model**: SP→`spSpent`, Hit/Skill Dice→`*Used`,
  Prisma→`prismaUsed`, all with resolved maxima (D26). Exhaustion is durable state
  with table-derived effects (D27).

### 2.5 Persistence (D11, D12, D13)

A **hybrid** keyed on lifecycle:

- **Durable entities** (PCs + reusable NPCs) → one `entity` table: hot/queryable
  fields as columns, capability payloads in a `components` jsonb. Child tables
  (inventory, archetypes, knives/chains) **fold into components**.
- **Ephemeral combatants/objects** → inline component blobs in the encounter
  session.
- **Catalog** (enemy defs, Shapechanger forms, Nyx Arcana) → authored TS, never DB.

| Entity | Lifecycle | Storage |
|---|---|---|
| PC / reusable NPC | durable | `entity` row + `components` |
| Enemy instance / object | ephemeral | session blob |
| Enemy def / form / Arcana | authored | TS catalog |

The component map is the **runtime + ephemeral** shape; durable rows **project**
into it at load (as v1 already projects `CharacterRow → HydratedCharacter`).
Optimistic concurrency is a **single `version`** column + server-side field merge +
reapply-on-stale retry — the per-surface counters are unnecessary once combat churn
lives off the durable row (D12).

### 2.6 The encounter: a Session container (D29, D21, D28)

The encounter is **not an entity** — it is a *Session container*:

```ts
// Runtime shape — what the engine sees. NO kind discrimination.
type Participant = {
  entity: Entity                 // already resolved by the loader (see below)
  overlay: { allegiance; turnState; ailments; battleConditions; conditionDurations; counters }
}
type Session = {
  round; currentActorId; advantage; firstSide
  participants: Participant[]
  // mapInstanceId → Tier 3 spatial state
}
```

**No `kind`-tagged combatant ref reaches engine logic (F1).** A durable combatant
persists as an `entityId` (resolved from the `entity` table); an ephemeral one
persists as an inline `Entity` (in the session blob). That durable-vs-inline
distinction is a **storage/serialization** concern, dissolved by the **loader** into
a uniform `Participant.entity` *once* at the boundary — the same way catalog enemies
resolve. The runtime `Participant` carries no `kind`, so nothing downstream branches
on it (avoiding the exact `CombatantRef` union D1 exists to kill).

- **Vitals placement follows lifecycle** (the key call): a durable combatant's
  `damage` lives on its **entity row**; an ephemeral combatant's lives **inline** in
  the session. Each combatant's vitals have exactly one home ⇒ **single-row,
  single-version writes** (the property that made v1's combat reducer pure and
  cheap, now generalized — "NPCs work like PCs, enemies stay ephemeral"). Only an
  event hitting *multiple durable* combatants is multi-row, handled by the existing
  `guardMany`.
- The **combat reducer stays pure** `(session, event) → session`, owning the overlay
  + inline-enemy vitals. (v1 has no `edits[]` decider — PC vitals already write the
  character row via a separate action.)
- **Allegiance is encounter-scoped** (DM sets sides at start) — which is what lets a
  charmed PC or NPC ally be classified correctly per-fight.
- **Action economy** is resolved-budget + consumption: `TurnState` stores actions
  *used*; the budget is a resolve-fold (base + zone enchantment + boss trait +
  mechanics), snapshotted at turn-start. `turnsPerRound` is resolved (boss = party
  size) with a pluggable drafting variant (D21).
- **Engagement** is stored elective state (not derivable); v2 improvements: **moving
  breaks it**, and candidates are **Allegiance-gated** to opposing entities (D28).
  Lives on the spatial token → Tier 3.

### 2.7 Rendering and visibility (D7, D20, D25)

- **Rendering is capability- and viewer-driven, never `kind`-driven** (D7). One
  capability→widget library (`Vitals → HealthBar`, …); "full sheet" vs "statblock
  card" is a **layout preset** chosen by the surface, not the entity (the same PC is
  both). `kind` controls nothing structural. **`Presentation` is cosmetic only** —
  `{ portraitUrl?, label? }`, no `kind` union (F4); "is this a PC" routes through the
  durable `entity.kind` *column* or ownership, never a render tag.
- **Redaction** is a uniform pass driven by **one enumerated policy table** — the
  single source of truth (F2):

  ```
  visible : (component, relationship) → "public" | "drop"
  relationship = f(viewer, entity.allegiance, ownership) ∈ {own, ally, opponent, spectator, dm}
  ```

  `visibleEntity(entity, viewer)` computes the relationship **once**, then folds the
  table over the entity's components — the per-component decision takes **no entity
  argument** (it can't re-inspect the entity, which keeps it pure and prevents the
  per-call-site judgement that bred v1's enemy-specific branch). "Drop" removes the
  whole component **key** (structurally absent, not nulled). Keying on Allegiance-
  relationship is **strictly better than v1's `kind`**: a charmed PC is correctly
  hidden from their old party; an NPC ally correctly reveals stats. The exact
  `(component × relationship)` cells come from the redaction requirements
  (`requirements/04-…`); field-level and fog-gated redaction are spatial → Tier 3.

### 2.8 Mechanics (D17)

Carry over v1's registry (keyed by mechanic `kind`, engine-owned behavior — not a
data port). The `Mechanics` component holds per-entity state; `resolve` consults
`getMechanic(key).transform(state, ctx)` for the layered fold (§2.3), and `resetOn`
is enforced by the encounter-end sweep — the call-sites v1 *declared but never
wired* (the v2 model is the one v1 anticipated). Mechanics are now a capability
**any** entity can carry, enemies included.

---

## 3. Consequences

**Gains**
- One uniform combatant model: PC, enemy, NPC, object share `resolve`, the reducer,
  and capability guards — no `kind` branches.
- Enemies/NPCs can hold Mechanics and Equipment (the original blocker).
- Shapechanger forms and Nyx Arcana are one resolve-fold; Usury's over-max HP is a
  sign flip. Three blocked requirements fall out of the model, not new machinery.
- Depletion dissolves the form-HP reconciliation problem entirely.
- Capability/allegiance rendering + redaction is more correct than v1's kind-based
  logic and is uniform across entities.
- Durable NPCs become first-class — the substrate campaign-planning tooling needs.

**Costs**
- A runtime narrowing layer (guards) is required — structural types are erased.
- `resolve` is a fold, not v1's static statblock — more computation per read (offset
  by `optimizePackageImports` + memoized catalog resolution; dedup survives, D29/O18).
- Two storage shapes (relational durable + jsonb ephemeral) and two vitals write
  paths — *honest*, since the lifecycles genuinely differ.
- AoE across multiple durable combatants is a multi-row transaction (rare; existing
  `guardMany`).

---

## 4. Build & migration (D2, D14, D15, D23)

- **Greenfield, carry-over** (D2): a from-scratch `game-v2` that reuses v1's wins —
  foundation vocabulary, Zod-first discipline, the pure DI + composition root, the
  mechanics registry, exhaustive-switch reducers, and the derive math — re-homed
  onto components.
- **Behavior is the acceptance spec** (D14): the ~440-requirement inventory, built
  by parallel extractors and validated by two independent oracles (test-suite +
  source), is what v2 is built against — not a code audit.
- **Test-first to parity** (D15): each requirement is tagged **PRESERVE** (reproduce
  exactly) or **SUPERSEDE** (a decision deliberately changes it, citing the D-number).
  Build slice-by-slice red→green; **golden-master** the derivation math (run v1
  `deriveHydratedCharacter` and v2 `resolve` over the same seeds, assert resolved
  numbers match). Respect the 3-tier test split (unit/integration/contract).
- **Cutover** (D23): parallel package behind the composition root; v2 runs off
  v1-projected inputs until its persistence lands; the `entity` table is the riskiest
  step — **do it last**, with a backfill from `characters`. v1 stays live until a
  slice is green.

---

## 5. Deferred scope

Recorded so a reader knows these are *intentionally* unaddressed, not forgotten.

- **Tier 2 — carry-over algorithms** (resolvers, turn-loop bookkeeping, duration-tick
  arithmetic, item-mutation engine, inventory resolution, Lineage Atlas builder,
  inheritance slot-validity, view-shapers, the `createGameEngine` method set). These
  don't change the model; they get re-homed onto components during the build,
  enforced by the parity tests. See `_validation-gaps.md` Tier 2.
- **Tier 3 — the Map-Instance spatial subsystem** (zone geometry, token movement,
  fog/reveal, connection locks, occupancy, `reduceMapGeometry`, and the spatial
  components **Position** + **Engagement**, plus field-level/fog-gated redaction). A
  large, self-contained layer → **its own future ADR**, after the core engine lands.
- **O12 — reusable object/hazard templates** — pending campaign-planning scope; the
  `entity` table already tolerates a `kind: "object"` row with null level.
- **Boss multi-turn economy ship-call** (D21) — the engine supports `turnsPerRound`;
  whether it ships is a later rules decision.
- **D22 weapon-basic-attack default** — a form replaces the weapon swing with its
  natural attack; flip in one line if a form should keep the swing.
