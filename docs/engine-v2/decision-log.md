# Engine v2 — Decision Log

A running log for the `@workspace/game-v2` redesign. We append a dated entry as
each fork is settled; once the big decisions stabilize this gets promoted to a
formal ADR. Status tags: **Settled**, **Leaning** (recommended, not ratified),
**Open**.

## Context — why v2

The v1 engine (`packages/game/src/engine`) is pure and dependency-injected,
which is excellent, but its participant types are **nominal**, not composable.
Two artifacts prove the pain:

1. **`CombatantRef` is a closed discriminated union** keyed on `kind`
   (`pc` | `enemy` | `catalog-enemy`). Every new participant shape — an NPC ally
   that equips items, a summon with a Mechanic, a destructible object — forces a
   new union arm or contortion of an existing one. The union *is* the type
   system fighting the domain.

2. **`Statblock` is a post-hoc unification we already had to build.** Its own
   doc comment admits it: *"A PC and an enemy are the same thing here; they
   differ only in provenance."* But `Statblock` is a **projection** computed by
   two converging functions (`statblockFromCharacter` / `statblockFromEnemy`),
   not the source model — and the union still leaks (*"Catalog enemies have no SP
   (the definition declares none)"*). SP isn't a property of a *kind*; it's a
   **capability** some entities carry.

The fix: model participants as **entities composed of capability components**,
so functions declare the capabilities they need (`applyDamage` needs
`Targetable`; `castSkill` needs `CastingCombatant`) and *any* entity carrying
those components qualifies — PC, enemy, NPC, summon, or object — with zero `kind`
branches.

---

## Decisions

### D1 — Direction: capability/component entity model (ECS-lite) · **Settled**

Participants are entities = a bag of named capability components. Capabilities
are expressed to function authors as TypeScript intersection types
(`Identity & Health & Allegiance`). This replaces the `CombatantRef` union and
makes the `Statblock` projection unnecessary as a *source* model.

**Why:** capabilities recombine freely (enemies can equip items / hold
Mechanics; objects can be `Targetable` without being combatants) — exactly what a
TTRPG needs and what nominal types block.

### D2 — Scope: greenfield `game-v2`, carry over v1's wins · **Settled**

`game-v2` is a from-scratch rebuild (characters, enemies, NPCs, objects all
become entities), **but not purist** — anything v1 does well is carried over
rather than reinvented. Runs parallel to the live `@workspace/game` engine until
cutover.

Carry-over candidates (to confirm per-slice in a later entry): the foundation
vocabulary (`LINEAGES`, `DAMAGE_TYPES`, `VIRTUE_KEYS`…), the Zod-schema-first
discipline, the pure DI + composition-root pattern (`createGameEngine`), the
mechanics behavior registry, the exhaustive-switch reducer style, and the
derive math itself (leveling/stats) — re-homed onto components, not the
`HydratedCharacter` god-type.

### D3 — Representation: component **map** storage + **intersection** views · **Leaning**

The sketch (`type CastingCombatant = Identity & Health & SkillPool`) quietly
assumes one of three physical representations. The three:

- **(a) Intersection of required slices** — gorgeous signatures, but you
  re-enumerate concrete entity types (drifts back toward nominal) and still need
  a storage union of all of them.
- **(b) Uber-record, optional fields** — `{ id; health?; skillPool?; … }`.
  Trivial storage, but every access is `?.` and a function can't *state* its
  requirements. **Rejected** — spreads optional-chaining everywhere.
- **(c) Component map** — `{ id; components: Partial<ComponentRegistry> }`. Most
  ECS-like; each component serializes as a named Zod blob (additive migrations —
  adding a capability never breaks old persisted rows); guards key off
  `components.skillPool !== undefined`.

**Recommendation:** **(c) for storage/persistence, (a) for function-author
ergonomics, with runtime type guards as the bridge.** Store the map; narrow once
at the boundary into the rich intersection *view*; write systems against
`Identity & Health`. Clean serialization *and* clean signatures; the guards are
the seam.

> *Revised by D11: "(c) for storage" overreached. The component map is the
> **runtime + ephemeral-persistence** shape; **durable** entities (PCs, NPCs)
> keep a relational table whose hot fields are columns and whose capability
> payloads are a `components` jsonb. The map is still how the engine sees every
> entity — durable rows project into it at load.*

### D4 — Structural typing is compile-time only; runtime needs a narrowing layer · **Settled**

Intersection types are erased at runtime — there is no `instanceof
CastingCombatant`. Loading a jsonb blob yields an `Entity` of unknown shape, so
the model **requires** capability type-guards:

```ts
function hasSkillPool(e: Entity): e is Entity & SkillPool {
  return e.components.skillPool !== undefined
}
```

The capability win is real but specific: we replace "discriminate on one closed
`kind` tag" with "discriminate on presence of each component." That is the right
trade for this domain — just design the guard/narrowing layer deliberately
rather than assuming structural types do it for free.

### D5 — Value provenance: generalize `MaxSource` to source-bearing components · **Leaning** · *extended by D8*

The sketch's `MaxSource` (`{ kind: "path"; path; level }` derive-recipe vs
`{ kind: "flat"; max }` bake) is the idea that kills the
`statblockFromCharacter` / `statblockFromEnemy` split. Generalize it: a
**derivable** component value carries its own source, and a single `resolve`
pass computes effective stats for any entity regardless of provenance — no
per-side derivation function. (This is v1's "derive-then-reduce" pipeline,
generalized per component.)

**Scope guard:** this applies only to *derivable* values (maxHP, maxSP, derived
attributes, affinity chart). `currentHP`, ailments, position, turn bookkeeping
are always literal state — wrapping *those* in a source union is
over-abstraction. The source-union is a property of specific components, not a
universal envelope.

### D6 — Reducers switch on event; handlers require capabilities · **Settled**

Keep the established exhaustive-switch-on-event-type reducer style (not a
registry — that guidance is for lookups). The capability payoff is in the
**handlers**: `applyDamage`'s handler takes `Targetable`, `castSkill`'s takes
`CastingCombatant`. An event targeting an entity that lacks the capability is a
validated no-op; any entity *with* the capability qualifies, with zero `kind`
branches.

### D7 — Rendering is capability- and viewer-driven, never kind-driven · **Settled** · *revised*

> *Revised from "provenance demoted to a hint component." The original still let
> renderers branch "PC sheet vs enemy statblock card"; under the capability model
> they don't.*

A health bar is a health bar; a skill card is a skill card. Widgets bind to
**capabilities**, not to entity kind: there is **one capability→widget library**
(`Vitals → HealthBar`, `SkillPool → SP bar`, resolved skill `→ SkillCard`,
`affinities → AffinityChart`, …). A component is present ⇒ its widget renders.
Nothing branches on `kind`.

What used to look like "two renderers" decomposes into three orthogonal axes,
**none of which is provenance**:

1. **Layout preset** — full editable sheet vs compact rail card. Chosen by the
   *surface + viewer*, **not the entity**: the same PC renders as a full sheet at
   `/c/[shortId]` and as a compact card in the DM combat rail. One entity wears
   both, so `kind` cannot pick the layout.
2. **Viewer permission** — what you may *see* and *edit*. v1's enemy-specific
   `player-snapshot` redaction is not "enemy rendering"; it's a visibility filter.
   A DM editing enemy HP and a player editing their own HP drive the *same*
   HealthBar in edit mode — editability is ownership + capability, not kind.
3. **Capability presence** — no `SkillPool` ⇒ no SP bar. Presence, not a branch.

Subtract those and `kind` controls nothing structural — it survives only as
cosmetic metadata (portrait, a "Foe" label), if at all. There is no "statblock
renderer" vs "sheet renderer".

**Engine consequence:** v1's enemy-specific redaction generalizes into a
**per-component visibility filter** applied uniformly to any entity for any
viewer (O10). The engine's job is uniform components + that filter; the UI's job
is the capability→widget map + layout presets.

### D8 — `resolve` is a layered fold; Mechanics contribute stat transforms (uniform PC/enemy) · **Settled**

Two real requirements drove this and they collapse into **one** mechanism:

- **Shapechanger** (PC Lineage Mechanic): changing form (bear, bird, …) alters
  attributes, affinities, skills, and **max HP**. Controls live in the Mechanics
  system.
- **Nyx-style enemy** (enemy Mechanic): swaps Arcana mid-fight, changing skills
  and affinities.

Both are *a Mechanic that transforms the resolved statblock at runtime*. So:

1. **Mechanics is a capability available to any entity** — PC, enemy, NPC. This
   is the headline goal; v1 hard-locked Mechanics (and items) to PCs.
2. **`resolve(entity) → ResolvedEntity` is a fold of layers** (emitting resolved
   capability components — D30), not v1's two converging authoring functions. The base layer is authored as a derive-recipe
   (PC) or flat profile (enemy) — D5. Mechanics, equipment, passives, and the
   combat overlay each contribute a transform on top.

**Layer order** (base → highest precedence), per the form semantics chosen:

1. **Base StatProfile** — derived (PC) or flat (enemy); includes archetype skills
   and the weapon basic attack.
2. **Active form / Arcana** — *replaces layer 1 wholesale* when a form-swap
   Mechanic is active (attributes / affinities / skills / maxHP / natural attack).
   A form is essentially an enemy-style flat profile the Mechanic swaps in. **The
   form swap touches only this layer** — layers 3–4 are inert to it.
3. **Inheritance** — inherited skills (active + passive); **pass through a form
   fully** (D19).
4. **Equipment** — granted skills (active + passive) + passive stat/affinity
   bonuses; **pass through a form fully** (D22), except the weapon basic attack
   (replaced by the form's natural attack, layer 2).
5. **Combat overlay** — ailments / battle conditions; temporary, applied last,
   cleared at end of combat.

`resolve` emits a **`ResolvedEntity`** — resolved *capability components*, not a
single struct (D30 — a flat `ResolvedStatblock` would be a god object). Computed
fresh and Mechanic-state-aware; renderers and combat systems narrow to the
resolved capabilities they need; nothing re-derives per side.

**Granularity refinement to D3:** attributes / affinities / skills / maxHP are
*read* separately by different systems (damage reads affinities+maxHP; casting
reads skills+SP) but *authored and swapped together* as a profile. So **authoring
granularity ≠ read granularity**: the StatProfile bundle is the swap unit; the
**resolved capability components** (D30) are the read units.

### D9 — Vitals stored as **depletion** (`damage` / `spSpent`), current derived · **Settled**

Store `damage` (and `spSpent`), not `currentHP`/`currentSP`. Derive
`currentHP = max(0, maxHP − damage)` in `resolve`. Because maxHP is itself
resolved (and Mechanic-mutable per D8), a form swap moves the ceiling under a
form-independent `damage` invariant — **no reconciliation policy needed**, it
falls out for free (this is "clamp-only" semantics with zero special-case code).
Overkill floors the *derived* value at 0 without losing the stored `damage`;
healing reduces `damage`; "fallen" is `damage ≥ maxHP`. SP is symmetric.

### D10 — `damage` is signed; over-max HP is negative damage; operations own their bounds · **Settled** · *extends D9*

Driven by the **Merchant / Usury** Mechanic: *Payday Loan* grants an enemy HP
"whose current HP may exceed its maximum." Both obvious framings were rejected —
**increased max HP** (inflates every `max`-relative calc: the "25% of max" loan,
the `currentHP ≤ balance` bankruptcy check) and **temp HP** (a parallel buffer
with its own damage-ordering rules; the loaned HP must behave like *real* HP).

D9's depletion model already covers it once we make one implicit thing explicit:

- **`damage` is a signed integer.** `currentHP = max(0, maxHP − damage)` — the
  bottom floor protects 0, there is **no top cap**. `damage < 0` ⇒ currentHP
  exceeds maxHP. Enemy 90/100 (`damage 10`) + 25 loan ⇒ `damage −15` ⇒ 115/100.
  `maxHP` stays honest at 100; only the current value floats above it.
- **Storage is unbounded (signed); each *operation* clamps to its own rule.** A
  normal heal floors `damage` at 0 (no overheal). The loan is the operation
  licensed to drive it negative; repayment pulls it back. The stored quantity
  doesn't police the ceiling — the operations do.

This composes with everything: over-max survives a form swap automatically
(D8/D9 — the ceiling moves under the signed invariant), and the rest of Usury is
counter arithmetic + turn hooks (loan balance is a `Counters` entry; APR /
bankruptcy / consolidation / repayment / liability never touch the HP *model*,
only `damage` and the counter). UI renders the over-max value literally
(`115/100`) — a display concern, not an engine one.

### D11 — Persistence (resolves O3): hybrid durable `entity` table + ephemeral session blob · **Settled** · *revises D3*

Grounding fact: v1 **already** persists entities two ways, and they map onto the
real lifecycle split — durable PCs as a fat relational `character` row + child
tables (with per-surface optimistic version columns and a conformance test);
combatants as an ephemeral component-ish blob inside the encounter `session`
jsonb (catalog enemies aren't rows — referenced by `enemyKey`). Mechanic state
already persists (`characterArchetype.mechanicState`). Computed values are
already never stored.

Three options were weighed — **A** pure ECS (`entity` + EAV/blob; uniform but
loses queryability, the version columns, builder, conformance — biggest
migration), **B** relational-durable + blob-ephemeral with components at runtime
(minimal migration, but a durable reusable NPC has no home), **C** hybrid durable
`entity` table (hot fields as columns, capabilities as jsonb) + ephemeral session
blob.

**Decision: Option C.** Driver: **durable, DM-authored NPCs are near-term**
(campaign planning tools are the next big feature), so a reusable NPC needs a
first-class home now. PCs and NPCs become the same row shape differing by `kind`
— exactly the campaign-tooling ergonomic (list / place / reuse NPCs with normal
SQL).

```ts
entities = pgTable("entity", {
  id, shortId, ownerId, campaignId,          // queryable hot fields stay columns
  kind: text().$type<"pc" | "npc">(),
  name, level, status,                         // level nullable — see D13
  version: integer(),                          // single token — see D12
  components: jsonb().$type<Partial<ComponentRegistry>>(),  // capability payloads
})
// ephemeral enemies/NPC-combatants/objects: { id, components } in the session/map blob
// enemy DEFINITIONS, Shapechanger FORMS, Nyx ARCANA: authored catalog (TS), not DB
```

**Storage matrix** (which entity lives where — the durable table holds *only*
PC + NPC; everything ephemeral is a column-less component blob):

| Entity | Lifecycle | Storage | Columns? |
|---|---|---|---|
| PC | durable, owned | durable `entity` row + `components` | yes |
| NPC (DM-authored, reusable) | durable | durable `entity` row + `components` | yes |
| Enemy *instance* in a fight | ephemeral | session blob (component map) | no — def in catalog |
| Object (door, hazard) | ephemeral | session/map blob (component map) | no |
| Enemy def / form / Arcana | authored | TS catalog | n/a |

A column-less blob has no "column or component" question — an absent capability is
just an absent key (a door is `{ id, components: { identity, vitals } }`, no
`level`).

**Child tables fold into `components`** (lean): `inventoryItem → Equipment`,
`characterArchetype` (+`mechanicState`) → `StatProfile` recipe + `Mechanics`,
knives/chains → identity components. None has a cross-row query need, so
relational buys nothing; the builder writes them as component edits.

This **revises D3's "(c) for storage"**: the component map is the runtime +
ephemeral shape; durable entities are relational with a `components` jsonb and
project into the map at load (as v1 already projects `CharacterRow →
HydratedCharacter`).

### D12 — Collapse per-surface version columns to a single `version` · **Leaning**

The per-surface tokens (`identityVersion`/`vitalsVersion`/…, UNN-140) fixed a
*real* bug — a debounced notes save false-staled by a concurrent vitals write.
But two v2 shifts undercut the justification:

1. **The hot contention leaves the durable row.** Combat churn (HP/SP, ailments,
   battle conditions) lives on the encounter session / combatant overlay (D8/D9).
   `vitalsVersion` guarded the collision that now evaporates; what's left on the
   durable row is slowly-edited authored/progression state.
2. **Server-side field merge already prevents lost updates.** The owner-mode
   write pattern (per-field actions that read-merge-write server-side; the
   UNN-226 cautionary tale) means independent fields can't clobber each other at
   *any* version granularity. The token's remaining job is "detect a stale
   snapshot of the field you're writing," which a single `version` + correct
   retry (refetch, reapply local edit, resend) covers — at most one extra
   round-trip, no data loss.

So four counters now optimize a low-probability latency blip at the cost of
per-write counter selection + drift risk → **collapse to one `version`**. Escape
hatch if a surface ever proves contended: a per-component `_v` *inside* the jsonb
(zero extra columns) — don't pre-build it.

*Leaning, not settled: pending confirmation, and it interacts with the builder's
autosave (verify the reapply-on-stale retry is in place before removing the
columns).*

### D13 — `level` is an entity column; "survives a form swap" is the StatProfile boundary test · **Settled**

`level` is a **column** on the durable `entity` table. Nullable — the null case
is a **statless narrative NPC** (a questgiver with no combat profile), *not*
objects: objects are ephemeral component blobs (D11 storage matrix) with no
columns at all, so they never face the question. The decisive reason is D8, not
queryability: a
form *replaces the `StatProfile` layer wholesale*, but a level-7 character who
turns into a bear is **still level 7**. So level must survive a form swap and
therefore **cannot** live in the swappable `StatProfile` bundle — it sits above
the profile as an entity fact that `resolve` consumes as an input.

- `StatProfile.source` (the derived recipe) does **not** embed level; it reads
  `entity.level` ambiently. Column is canonical; component is the rule. No drift.
- Queryability confirms it (campaign NPC filters, encounter balancing, My
  Characters) — the D11 hot-column criterion, met squarely.
- Ephemeral catalog-enemy combatants get level from the catalog definition, not a
  row column.

**Reusable boundary rule:** anything that must survive a form swap is an
entity-level field or its own component — **never `StatProfile`**. Passing the
test: level, identity, `damage` (D9), mechanic state, passives. Failing it (i.e.
*is* `StatProfile`, swapped by a form): attributes, affinities, skills, maxHP.

### D14 — v2 readiness is verified against a behavior inventory, not a code audit (resolves O5) · **Settled**

O5 originally meant "walk v1 module-by-module, tag keep/modify/drop." Reframed:
v2 is a rewrite, so what matters is **behavior preservation**, not code reuse
decisions. Instead we extracted an implementation-agnostic **requirements
inventory** of everything v1 guarantees — `requirements/` (~440 testable
requirements with `source:`/`edge:` refs), built by parallel subdomain extractors
and validated by two independent oracles (test-suite walker + source re-walker)
that converged on the same gaps. This is the **acceptance spec** v2 builds
against and the thing that surfaces gaps in the component model.

Findings that bear on open decisions:

- **D8 is already stubbed in v1.** `MechanicDefinition.transform` and `resetOn`
  are declared but call-site-less, JSDoc'd as reserved for "the future combat
  tracker / Shapeshifter Lineage." The v2 resolve-fold is the call-site v1
  anticipated — strong validation, not a leap.
- **D9-adjacent comparator to preserve:** skill HP affordability is **strict `>`**
  (a skill can never drop the caster to 0 HP), SP is **`>=`**; %HP cost is
  `max(1, floor(maxHP*amt/100))`. The depletion model must keep this asymmetry as
  an *operation* bound (per D10: operations own their clamps).
- **O10 redaction is exact and security-critical:** enemy `attributes`/`affinities`
  are *structurally absent* on the player wire (not null). The uniform
  per-component visibility filter must reproduce "absent, not nulled."
- **O11 / D8:** only the Toccata enchantment is engine-modeled; Requiem/Tarantella
  are prose-only today — so the action-economy transform layer is partly greenfield,
  not just a port.
- **Inherited non-goals (don't "fix" in v2):** per-source counter caps
  (Lumina/Tells) unenforced; ailment combat resolution (Technicals/saves) not
  modeled; exhaustion levels 1–6 are placeholder text (rulebook table unshipped).

Next: the **gap analysis** — walk the inventory against D1–D13 and flag any
requirement the component model can't express or that strains a resolve
layer/precedence (feeds O7/O8/O9).

### D15 — v2 is built test-first to parity against the inventory, split preserve/supersede · **Settled**

The requirements inventory (D14) is the acceptance spec; v2 is built test-first
against it (red → implement → green, per slice — Prime Directive #2). Mechanics:

- **Every requirement is tagged PRESERVE or SUPERSEDE.** *Preserve* = a game rule
  v2 must reproduce exactly (the numeric/ordering/redaction rules). *Supersede* =
  behavior D8–D11 deliberately change (currentHP-clamp → depletion D9; `CombatantRef`
  union → components; enemy-has-no-SP → capability; static statblock → resolve
  D8). A *supersede* requirement points at the D-number that replaces it. **This
  tagging is the parity spec** — without it, "parity with v1" silently
  re-enshrines the limitations v2 exists to remove.
- **v1 tests are reference material, not a runnable harness.** They're bound to v1
  shapes (`HydratedCharacter`, `CombatantRef`); the inventory already distilled
  their behaviors. v2 gets fresh tests in component vocabulary (compositional
  fixtures: `makeEntity().with(vitals)…`).
- **Golden-master for the PRESERVE derivation math.** Run v1 `deriveHydratedCharacter`
  and v2 `resolve` over the same seed characters; assert the *resolved numbers*
  (attributes/maxHP/SP/affinity chart) match. Numbers are shape-independent, so
  this is cheap exhaustive parity for the most regression-prone category. Falls
  back to requirement-derived tests where outputs can't project to a common shape
  (the reducer's changed event vocab).
- **Respect the existing 3-tier split** (UNN-363: unit / integration / contract) —
  a comparator is a unit test, the derive→resolve→reduce pipeline is integration,
  real-catalog smoke is contract. Don't force everything into integration.

Next action: a first-cut **preserve/supersede annotation** over `requirements/`
(clear cases tagged against D8–D11; judgment calls flagged for the user).

### D16 — Component registry is the keystone; a guard *factory* derives views + predicates (resolves O2) · **Settled**

```ts
type ComponentRegistry = {            // single source of truth
  identity: Identity; allegiance: Allegiance; statProfile: StatProfile
  vitals: Vitals; skillPool: SkillPool; mechanics: Mechanics
  equipment: Equipment; passives: Passives; /* …overlay components… */
}
type Entity = { id: string; components: Partial<ComponentRegistry> }  // ephemeral; durable adds columns (D11)

type Has<K extends keyof ComponentRegistry> =
  Entity & { components: Pick<ComponentRegistry, K> }   // K becomes required (registry is non-partial)

const guard = <K extends keyof ComponentRegistry>(...keys: K[]) =>
  (e: Entity): e is Has<K> => keys.every((k) => e.components[k] !== undefined)
```

A first draft used a single-key `has()` and "named guards compose `has`" — **wrong
twice** (caught in review):

1. **A wrapper erases the predicate.** `const isX = (e) => has(e,"vitals")` infers
   `=> boolean`, not `=> e is …` — TS doesn't re-derive a predicate from a body. The
   **factory** fixes it: the returned function's *type* is `(e: Entity) => e is
   Has<K>`, so `const canCast = guard("skillPool")` carries its predicate (K is bound
   at the call site).
2. **"Narrow once" needs a multi-key guard.** A system wanting two capabilities
   would chain `isTargetable(e) && canCast(e)` — which *does* narrow (sequential `&&`
   predicates intersect) but only emergently. The factory makes it first-class:
   `guard("vitals","skillPool")` → `e is Has<"vitals"|"skillPool">`, one narrowing.

Express each system's requirement **once** as a key tuple; derive guard + view from it
(can't drift):

```ts
const CASTER = ["identity", "vitals", "skillPool"] as const
type Caster = Has<(typeof CASTER)[number]>
const isCaster = guard(...CASTER)
function castSkill(c: Caster) { c.components.skillPool /* ✓ */ }
if (isCaster(e)) castSkill(e)
```

Caveat: TS **does not verify a predicate body**, so `guard` is trusted — but the
`every(...)` check and `Has<K>` derive from the same `K`, so the trust is
concentrated in that one line. Adding a component = one registry key; `Entity`,
`Has`, and every guard follow automatically.

### D17 — Mechanics registry binding (resolves O4) · **Settled**

Carry over v1's registry shape (keyed by mechanic `kind`, behavior modules,
engine-owned — **not** a data port; the existing carve-out holds). The `Mechanics`
component = `{ states: Record<MechanicKey, MechanicState> }`. `resolve` consults
`getMechanic(key).transform(state, ctx)` for each active mechanic to contribute a
StatProfile/action transform (D8); `resetOn` is enforced by the encounter-end
sweep — the call-sites v1 declared but never wired (D14).

### D18 — Transform precedence & stacking (resolves O8) · **Settled**

The fold order is **fixed and documented** (D8): base → active form (replaces base
layer) → passives → equipment → mechanic deltas → combat overlay. Two transform
kinds: **override** (sets a field; later layer wins — affinities/skills/maxHP swaps)
and **delta** (additive numeric; accumulates — buffs). Whether a specific buff
*stacks with itself or caps* is an **effect-data rule the effect declares**, not
engine logic — the engine applies whatever the effect/mechanic specifies, keeping
resolution deterministic and the rules in data.

### D19 — Skill taxonomy + form persistence (resolves O9) · **Settled** · *corrected*

> *Corrected after review: the first draft said "add an explicit active/passive
> flag" and "passives survive a form swap." Both were wrong — Skill **already** has
> `kind`, and "passives survive" is too coarse (it's source-dependent, not a single
> layer).*

- **Use the existing Skill `kind`** (`active`/`passive`) — don't add a flag, don't
  infer passive from no-cost.
- **A form declaring its own passives is just authoring** them into the form's
  skill list — not an engine rule.
- **A form replaces only the archetype base; carried kit passes through in full**
  (resolved below). Under an active form:
  - **Archetype** kit (active + passive) → **replaced** by the form.
  - **Equipped items** → skills + passive bonuses **pass through fully** (one
    carve-out: the weapon *basic attack* — D22).
  - **Inheritance slots** → **pass through fully** (active + passive).
- Active skills keep v1's cost semantics exactly (strict-`>` HP, `>=` SP —
  PRESERVE, D14/D15).

**O1 fix:** the speculative `Passives` component is dropped — passive skills are a
*resolved output* of (archetype ∪ equipment ∪ inheritance), not an authored source.
The authored component is **`Inheritance`** (`{ slots: InheritanceSlots }`).

**Resolved — full pass-through (and it extends to equipment).** Inherited skills
**and** equipment-granted skills pass through a form **fully (active + passive)**.
Rationale (user): it's fun, rewards creative builds, and carries no real balance
risk — the form's *base* is the balancing lever, not the kit you bring. This
**collapses the source-keyed table above** into one rule:

> **A form replaces only the archetype base** (attributes, affinities, maxHP,
> archetype skills, natural attacks). **Inheritance and equipment layers pass
> through untouched** — exactly as they apply normally. No "suppression" logic.

In D8's fold the form swap touches **only layer 1**; inheritance + equipment
layers are inert to it. See D22 for the one carve-out (the weapon *basic attack*).

*Parked note:* the Skill model itself could be **composed** (a skill = a bundle of
effect-capabilities) rather than `kind`-tagged — D1 applied one level down. Out of
scope here; tracked as a consistency opportunity.

### D20 — Visibility/permission is a uniform per-component pass (resolves O10) · **Settled**

`visibleEntity(entity, viewer) → Entity`, viewer ∈ {owner, dm, ally, opponent,
spectator}. Each component declares a **visibility policy** (public / owner+dm /
dm-only); redaction drops the whole component **key** — *structurally absent, not
nulled* (PRESERVE the exact v1 wire contract, D14). Editability is a separate
per-component write policy. One pass over the component map replaces v1's
enemy-specific `player-snapshot` (D7's engine consequence, realized).

### D21 — Action economy: resolved budget + consumption (resolves O11) · **Settled** (boss ship-call deferred)

Stored `TurnState` = **consumption** (D9): `{ movesUsed, standardsUsed,
reactionsUsed, turnsTakenThisRound }`. Budget is **resolved** (D8 fold): base
(1/1/1; 1 turn) + transforms (zone enchantment, boss trait, mechanics),
**snapshotted at turn start** for "start-of-turn-in-zone" grants. `available =
resolved − used`. `turnsPerRound` is resolved (boss = party size); the drafting
selector takes a **pluggable variant** for multi-turn. Whether the boss economy
ships is a rules call (deferred) — the engine supports it regardless.

### D22 — Equipment through forms (resolves O7) · **Settled**

Equipment **passes through a form fully** — both equipment-granted *skills*
(active + passive) and *passive stat/affinity bonuses* apply on top of the form's
resolved stats (user call, D19: full pass-through rewards creative builds, low
balance risk). **One carve-out:** the equipped weapon's *basic attack roll*
(v1 `weaponAttackRoll`, the plain weapon swing — distinct from equipment-granted
*skills*) is treated as part of the **body**, so a form replaces it with the
form's natural attack (a bear claws, it doesn't swing your greatsword). Override
is one line if a form should keep the weapon swing too. Optional per-form **"pure
beast" flag** still available to suppress all carried kit.

### D23 — Cutover strategy (resolves O6) · **Settled** (sketch; refines as built)

`game-v2` is a parallel package; the **engine boundary / composition root**
(`game-engine.ts`) is the seam. Migrate **slice-by-slice** behind the boundary,
each gated by parity tests + golden-master (D15). v2 runs off **v1-projected
inputs** via an adapter until its own persistence lands. The **DB `entity` table
(D11) is the riskiest step — do it last**, with a backfill projecting `characters`
rows → entity rows. v1 stays live until a slice is green.

---

## O1 — Initial component catalog · **Settled (first cut)**

Granularity principle (ratified): **a component is the smallest cluster a single
system reads/writes together** — refined by D8 (authoring vs read granularity).
Stored as `Partial<ComponentRegistry>` (D3); resolved capability components
(`ResolvedEntity`, D30) are computed, not stored.

| Component | Shape (authored) | Capability it grants | Notes |
|---|---|---|---|
| **Identity** | `{ id; name }` | — (universal) | Every entity. |
| **Presentation** | `{ kind: "pc"\|"enemy"\|"npc"\|"object"; … }` | renderer hint | D7 — not load-bearing. |
| **Allegiance** | `{ side }` | `Targetable`/combat membership | Orthogonal to `kind` (charmed PC / summon can sit either side). |
| **StatProfile** | `{ source: derived-recipe \| flat-profile }` | base of `resolve` | D5/D8 base layer. Flat profile = `{ attributes; maxHP; maxSP?; affinities; skills }`. |
| **Vitals (Health)** | `{ damage }` | `Targetable` (takes damage) | D9. maxHP from `resolve`. |
| **SkillPool** | `{ spSpent }` | `CastingCombatant` | D9. Presence = can spend SP. |
| **Mechanics** | `{ states: Record<MechanicKey, MechanicState> }` | runtime transforms (forms/Arcana/…) | D8. **Now available to enemies/NPCs.** Each mechanic's behavior contributes a transform; form-swap mechanics declare variant profiles. |
| **Equipment** | `{ slots / items }` | wields/wears | Contributes transforms; now available to enemies/NPCs. Skills + bonuses pass through a form fully; only the weapon basic attack is replaced by the form's natural attack (D22). |
| **Inheritance** | `{ slots: InheritanceSlots }` | inherited skills | ≈ v1 `CharacterArchetype.inheritanceSlots`. Passive skills are a *resolved output* of archetype ∪ equipment ∪ inheritance, **not** an authored component (D19). Form behavior pending (D19 open arm). |
| **Ailments** | overlay | — | Combat overlay; cleared at end of combat. |
| **BattleConditions** + **ConditionDurations** | overlay | — | Overlay; durations tick down. |
| **TurnState** | `{ movesUsed; standardsUsed; reactionsUsed; turnsTakenThisRound }` | acts in initiative | Consumption (D21); budget resolved (D8). |
| **Counters** | `{ … }` | named counters (Lumina) | Overlay. |
| **Position** | `{ zone / token ref }` | `Positioned` | Spatial; may live on the map token (v1 homed it there). |

**Worked traces:**

- *Shapechanger PC* = Identity + Presentation(pc) + Allegiance + StatProfile(**derived**)
  + Vitals + SkillPool + **Mechanics**(shapechanger: active="bear") + Equipment +
  Passives. `resolve` swaps the bear profile into layer 2; passives persist;
  `damage` carries across.
- *Nyx enemy* = Identity + Presentation(enemy) + Allegiance + StatProfile(**flat**)
  + Vitals + **Mechanics**(arcana-swap: active="Magician") + overlay. Same code
  path as the PC — only the base layer's `source` differs.

---

### D25 — Visibility keys on Allegiance-relationship, not kind (resolves O13 core) · **Settled**

Redaction is a function of the **viewer's relationship to the entity's
Allegiance** (+ ownership), not entity `kind`:

| Relationship | Sees |
|---|---|
| **own** (controls it) | full + editable |
| **same side** (ally) | full read (attributes visible) |
| **opposing side** | redacted — attributes/affinities **structurally absent** |
| **spectator/none** | public projection only |

D20 becomes `(component, relationship)`. **Strictly better than v1's kind-based
redaction:** a charmed PC on the enemy side is correctly redacted from their old
party; an NPC ally correctly reveals stats. The other parts the validator filed
under O13 are *not* Allegiance-driven and re-file: **field-level redaction**
(`zoneId→""`, far `toZoneId`) and **fog-gating** are spatial → Tier 3; the
**snapshot envelope projector** is Tier 2 (mechanical).

### D26 — Depletion is the universal consumable model (resolves O14) · **Settled** · *generalizes D9*

Every derivable consumable is stored as **`used`/`spent`**, max **resolved**,
current = max − used: HP→`damage`, SP→`spSpent`, Hit Dice→`hitDiceUsed`, Skill
Dice→`skillDiceUsed`, Prisma→`prismaUsed`. A **`Resources`** component holds the
derivable pools (dice, prisma); their max derives from level/path (dice) and the
Prisma upgrade tree (Prisma — store `prismaUsed` now, derive max when the tree
ships; forward-compatible). **Currency + `manualBonuses` are durable columns**
(D11), not components.

### D27 — Exhaustion is durable, effects derived (resolves O15) · **Settled**

Exhaustion *level* (0–6) is **durable** state (Resources/column) — **not** combat
overlay, so D8's end-of-combat clear never touches it (the correctness trap the
validator flagged). Its *effects* derive from the exhaustion table at resolve
time. Stored level = truth; table = data. (Table descriptions 1–6 are still
placeholder per D14 — a data TODO, not an engine gap.)

### D28 — Engagement v2 improvements (resolves O17) · **Settled** (designed with Tier 3)

Two deliberate departures from v1, both improvements:
1. **Moving breaks engagement.** v1 left the melee lock intact across moves
   (UNN-315 decoupled them); v2 **couples** them — a move clears the lock.
2. **Candidate list is Allegiance-gated** — only **opposing-side** entities are
   engageable (v1 offered every in-zone combatant regardless of side; objects/
   allies are now excluded).

Engagement stays **stored elective state** (`{free} | {engaged,
targetCombatantIds}`) on the spatial occupancy token → designed with the Tier-3
Map-Instance subsystem, not derived.

### D29 — Encounter is a Session container; vitals placement follows lifecycle (resolves O16) · **Settled**

Grounded by the architecture report (`encounter-write-architecture.md`), which
**corrected the premise**: there is no `(session, event) → {session', edits[]}`
decider — that idea was abandoned and survives only in a stale doc comment. The
live reducer is pure `(session, event) → session` with **no emits**, and **PC
vitals were never a combat event** — they write the character row via a separate
Server Action and never touch the encounter. So PC and enemy vitals already live
in separate row families, versions, and realtime channels: **v1 already has the
entity-aligned split.**

**Decisions:**
- **Encounter = Session container** (not an entity): session scalars (`round`/
  `currentActorId`/`advantage`/`firstSide`) + a participant roster. A participant
  = combatant ref + encounter-scoped overlay. The combatant ref is
  `{kind:"ref", entityId}` (durable PC/NPC) | `{kind:"inline", entity}`
  (ephemeral enemy/object). `resolve` composes entity components + overlay
  uniformly regardless of ref kind.
- **Allegiance is encounter-scoped**, DM sets sides at encounter start.
- **Vitals placement follows lifecycle** (the key call): ephemeral combatants keep
  `damage` **inline on the session** (cheap — an AoE on N mooks is one session
  write); durable combatants (PC + reusable NPC) keep `damage` **on the entity
  row** (PCs already do this; NPCs gain persistent HP). **Each combatant's vitals
  have exactly one home ⇒ writes stay single-row / single-version.** The
  `1+N rows/versions in a tx` case only arises for one event hitting multiple
  *durable* combatants (rare) — and `guardMany` already handles that shape.
- **O1 lifecycle re-tag:** durable-on-entity (Identity, StatProfile, Vitals,
  SkillPool, Mechanics, Equipment, Inheritance, Resources) · encounter-overlay,
  cleared at combat end (Allegiance, TurnState, Ailments, BattleConditions+
  durations, Counters) · spatial/Tier-3 (Position, Engagement).

Net: this **generalizes three existing patterns** (the PC `adjust-pools` path,
`guardMany`, composite snapshot versions) — "NPCs work like PCs, enemies stay
ephemeral" — rather than building new infrastructure. The combat reducer stays
pure, owning the overlay + inline-enemy vitals only.

### D30 — `resolve` emits resolved capability components, not a `ResolvedStatblock` god object · **Settled** · *corrects D8*

Caught in ADR review: `ResolvedStatblock { attributes, maxHP, maxSP, affinities,
skills, weaponAttackRoll?, abilities? }` is a **god object** — it re-imports v1's
`Statblock` under a "Resolved" prefix and **contradicts D8's own read-granularity
principle** (D8 says the resolved fields *are* the read units, then bundled them).
A consumer needing only effective maxHP would couple to the whole shape — exactly
what D1 exists to kill.

**Fix:** `resolve(entity) → ResolvedEntity` is **`Entity → Entity`
(authored → effective)** — component-shaped, narrowed with the same `Has<…>`/
`guard` machinery (D16). Consumers narrow to the resolved capabilities they need:

```ts
type ResolvedComponentRegistry = {           // derived read-units only (F3)
  attributes: AttributeScores; vitals: { currentHP; maxHP }; skillPool: { currentSP; maxSP }
  affinities: AffinityChart; skills: ResolvedSkill[]; attack: ResolvedAttackRoll
}
type ResolvedEntity = { id; components: Partial<ResolvedComponentRegistry> }
```

Resolved vitals expose **`currentHP`** (derived), not authored `damage` — no
authored field smears into a resolved type (F3, D31).

- **Compute-once, expose-narrowly:** the fold still runs **one pass** (it's
  cross-cutting — a form touches several stats together) producing the full
  resolved set; only the *interface* is composable. No runtime cost — it just stops
  leaking the bundle as a type.
- **Two registries:** `ComponentRegistry` (authored/stored) and
  `ResolvedComponentRegistry` (computed) are distinct but overlapping —
  `StatProfile.source` is authored-only, effective `attributes` resolved-only,
  `vitals` spans both (authored `damage` + resolved `maxHP`). They share the guard
  factory.
- Fits derive→reduce: **reads** consume `ResolvedEntity`; **writes** target authored
  components, then re-resolve.

### D31 — Principles-adherence review fixes (F1–F6) · **Settled**

An adversarial critic audited the design for fidelity to its *own* intent
(composition/ECS, capability-not-kind, purity, no god objects) — orthogonal to the
completeness pass (D24). It cleared most of the design as faithful (StatProfile as
the authored swap-bundle, the one-pass resolve, engine purity, the `entity.kind`
*column*, the overlay bundle, Session-as-container, depletion) and surfaced six
real violations (`_principles-review.md`). All accepted:

- **F1 (betrays-thesis) — `Participant.ref {kind:"ref"|"inline"}` is the
  `CombatantRef` ghost.** Fix: the durable-vs-inline split is a *storage* concern;
  the **loader dissolves it into a uniform `Participant.entity`** at the boundary
  (like catalog enemies). No `kind` reaches engine logic. (ADR §2.6.)
- **F2 (betrays-thesis, security) — redaction asserted, not enumerated.** Fix:
  **one `(component, relationship) → public|drop` table** as the source of truth;
  `visibleEntity` computes relationship once, then folds the table with **no entity
  argument** (stays pure; no per-call-site judgement). (ADR §2.7.)
- **F3 (smell) — resolved `vitals {damage,maxHP}` smeared an authored field.** Fix:
  resolved vitals = **`{currentHP, maxHP}`**, skillPool = `{currentSP, maxSP}` —
  derived read-units only; `damage`/`spSpent` stay authored. (D30, ADR §2.3.)
- **F4 (smell) — `Presentation.kind: pc|enemy|npc|object` re-ships the provenance
  union.** Fix: `Presentation` is cosmetic only (`{portraitUrl?, label?}`); "is-PC"
  routes through the `entity.kind` column or ownership. (ADR §2.2/§2.7.)
- **F5 (nit) — `Resources` bundled `exhaustion` (a level, not a spend-pool).** Fix:
  split **Exhaustion** `{ level }` into its own durable component. (ADR §2.2.)
- **F6 (nit) — `guard` checks presence, not shape.** Sound; documented that **shape
  is validated at the Zod load seam**, so presence-guarding downstream is correct.
  (ADR §2.1.)

Meta-lesson: a design can be complete *and* sound *and* still betray its thesis
(F1 is the `ResolvedStatblock`/D30 lesson again, at the Session's center). The
composition discipline has to be audited as its own concern.

## Validation outcome (D24)

### D24 — Design validated against the inventory; gaps scoped into 3 tiers · **Settled**

Six validators classified all ~440 requirements PRESERVE/SUPERSEDE/GAP against
D1–D23 (`requirements/annotated/`; consolidated `requirements/_validation-gaps.md`).
**No requirement is a rule contradiction** — D1–D23 hold. But validation exposed
that the log is a **data-model + departures ADR**, not a full engine spec: it
designed the novel half deeply and left the behavioral half as implicit carry-over.
Gaps scoped into three tiers:

- **Tier 1 — model genuinely insufficient; decide before building** → new OQs
  O13–O18 below.
- **Tier 2 — carry-over algorithms; re-home onto components during the build**,
  enforced by D15 parity tests (resolvers, turn-loop bookkeeping, duration-tick
  arithmetic, item-mutation engine, inventory resolution, Lineage Atlas builder,
  inheritance slot-validity, view-shapers, `createGameEngine` method set). Risk is
  execution, not design — no new decision needed.
- **Tier 3 — Map-Instance spatial subsystem** (geometry/fog/reveal/occupancy/
  `reduceMapGeometry`): entirely unaddressed, large, self-contained → **its own
  epic**, designed after the core engine lands.

## Open questions

Tier-1 model gaps from D24 (decide before/early in the build):

- ~~**O13**~~ → **D25** (Allegiance-relationship redaction; field-level/fog → Tier 3).
- ~~**O14**~~ → **D26** (depletion = universal consumable; Resources component).
- ~~**O15**~~ → **D27** (exhaustion durable, effects derived).
- ~~**O17**~~ → **D28** (moving breaks engagement; Allegiance-gated candidates).
- ~~**O16**~~ → **D29** (Session container; vitals placement follows lifecycle).
  The architecture report corrected the premise (no `edits[]` decider; PC & enemy
  vitals already separate) — the change is *not* large; it generalizes the existing
  PC pattern to NPCs while enemies stay cheap. *Leaning pending user nod.*
- **O18 — Catalog-enemy dedup** → **resolved by D29.** An ephemeral catalog enemy
  is `{kind:"inline", entity}` whose `StatProfile.source` references the catalog by
  key; per-instance state (`damage`, overlay) is on the participant. The immutable
  definition is still resolved **once per `enemyKey`** at snapshot/`resolve`
  assembly (a read-time memoization, unchanged from v1's
  `resolveCatalogEnemyStatblocks`). Dedup survives; `getEnemy` resolves at the
  read/assembly boundary.

Deferred:

All earlier design forks resolved except O12. Resolution map: **O2→D16, O3→D11, O4→D17,
O5→D14, O6→D23, O7→D22, O8→D18, O9→D19, O10→D20, O11→D21.** Full rationale for
each lives in its decision entry above.

- **O11 → D21 — boss multi-turn ship/no-ship is a deferred rules call.** The
  engine supports it; whether it ships is a later game-design decision.
- **D22 weapon-basic-attack carve-out** — settled with a default (form's natural
  attack replaces the weapon swing; equipment-granted *skills* still pass through).
  One-line override if a form should keep the weapon swing.
- **O12 — Reusable object/hazard templates** (still open). Campaign planning may
  let DMs author reusable objects ("Reinforced Door, 200 HP") — durable but
  object-shaped (no owner-as-player, no level). Catalog-style authored data vs a
  `kind: "object"` durable `entity` row? The entity table already tolerates the
  latter (null level). Decide if/when the feature lands — premature now.
