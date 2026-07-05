# ADR: Engine v2 — Characters (storage, writes, read models, surfaces)

**Status:** Accepted (Jackson, 2026-07-05) · build not started
**Scope:** the **character domain** rebuilt on the engine-v2 capability thesis —
the durable `entity` table (promoted to the program's foundation), the durable
write factory (CD18–CD20 generalized off the combat session), the per-surface
read-model rule, the combat↔character coupling repoints, creation-time rules,
and the rebuild of the four character surfaces (sheet, builder, Lineage Atlas,
My Characters + command-palette bindings) — the sheet and My Characters **fused
with their Showtime! brand redesign** (CH11). Combat surfaces, dungeon
exploration (UNN-540), the bestiary projection (UNN-547), and the drawer fix
(UNN-538) stay on their own tracks.
**Supersedes:** the design intent of v1's character domain — `HydratedCharacter`
/ `CharacterEdit` / `reduceCharacter`, the `characters` + `characterArchetypes`
(+ knives/chains/inventory child) tables, and the per-field write wrappers —
**and** the port-in-place roadmap waves (UNN-543/545/546/548/549; their verified
findings are mined, their sequencing dies — CH1).
**Supporting artifacts:** [`decision-log.md`](./decision-log.md) (chronological
rationale, **CH1–CH20**), the [parent ADR](../ADR.md) (D-numbers), the
[combat ADR](../combat/ADR.md) (CD-numbers; §2.11's write-router is the pattern
this ADR generalizes), [`requirements/01-character-derivation.md`](../requirements/01-character-derivation.md),
[`requirements/05-rest-items-skills.md`](../requirements/05-rest-items-skills.md),
[`requirements/06-atlas-inheritance-composition.md`](../requirements/06-atlas-inheritance-composition.md),
[`HANDOFF.md`](./HANDOFF.md) (program context + verified investigation facts).

> This ADR is the **clean current-state synthesis**. Where it cites `CH<n>` the
> chronological reasoning lives in the decision log; `D<n>` cites the parent
> ADR, `CD<n>` the combat ADR. Where a question is genuinely open it is flagged
> Open below, not silently picked.

---

## 1. Context

Engine v2 is done and load-bearing: all combat runs on it (UNN-520/530/535/536),
every derived number on the sheet is v2-computed through a bridge (UNN-533), and
the spatial engine is built and golden-mastered. What remains of v1 is exactly
the **character domain**: the type layer (`HydratedCharacter` and subtypes), the
write pipeline (`CharacterEdit`/`reduceCharacter`/per-field wrappers), the
`characters`/`characterArchetypes` storage, and the surfaces that consume them.

A 10-PR port-in-place roadmap existed (2026-07-03) and was diagnosed as going
**backwards**, for three root causes (CH1):

1. **The cutover unit was "engine," not "vertical slice."** Every surface's
   v1-worldview contract survived and demanded an adapter; the sum of those
   adapters (`character-view.ts`, `pool-write-adapter.ts`, `rawInputsToEntity`)
   is a shadow engine accreting in `apps/web/lib/game-v2/`.
2. **The entity-kind distinction, killed in the engine, was still decided three
   times in the display layer** (`HydratedCharacter` / `Statblock` /
   `CombatantDetail` — parallel per-kind flatteners; the F1 anti-pattern one
   level up).
3. **A premise changed without re-sequencing:** character data was declared
   expendable (2026-07-01, fresh-start/no-backfill), which invalidated
   "entity table last" (D23) — storage-last is what generated most of the
   scaffolding the roadmap was busy building.

Separately, the game landed its name and brand — **Showtime!**
(`docs/brand/brand-guide.md`) — and the sheet + My Characters redesign is
deliberately **fused** with this rebuild (CH11): each of those surfaces is built
once, on v2-native shapes, to the new brand. No pixel-parity porting.

**Prime directives (anti-goals, non-negotiable):**

- **No shadow engine.** `apps/web` does projection and joining only, never
  derivation; no adapter layer that becomes permanent.
- **No lingua-franca god-DTO.** `HydratedCharacter` gets no successor (CH7).
- **No preserved v1 contracts.** Flipping what *computes* a value while keeping
  the old contract enshrines the old worldview (the PR11a lesson).
- **One write architecture.** Character writes join the registry-driven
  write-router pattern (CD18–CD20), generalized to durable entity writes (CH5).

---

## 2. Decision

### 2.1 Program shape: vertical slices over a storage foundation (CH1; amends D23)

The cutover unit is the **vertical slice**: one surface at a time is rebuilt
end-to-end on v2-native shapes — storage → write factory → read model → UI —
and its v1 predecessor (component tree, contracts, and eventually tables) is
**deleted when the slice lands**. No slice ships an adapter between an old
contract and new storage or vice versa.

The **entity table moves from last to first** (UNN-511 promoted to the
foundation slice). D23's "do the table last, with a backfill" was risk
management for data that no longer needs to survive; with fresh-start declared,
storage-last only generates scaffolding (`rawInputsToEntity` as a permanent
projector, `pool-write-adapter`, preserved row contracts) that every subsequent
slice then has to route around. Storage-first means every slice above it builds
against the real, final shapes — the scaffolding is never born.

### 2.2 Storage: the `entity` table (CH2, CH3, CH15–CH17; parent D11, D12, D35, D39)

One durable table, `entity`, fresh-start (no backfill — CH2). Existing
`characters`/`characterArchetypes`/`characterKnife`/`characterChain`/
`inventoryItem` rows are throwaway; the tables are dropped at the end of the
program (§4, S4).

**Storage is the component-column projection (CH15; amends parent D11's
"capability payloads in a `components` jsonb").** Durable components are not
stored as one jsonb bag — the table carries **one column per durable component
key**, each column holding that component's payload verbatim (jsonb for
structured payloads; a native scalar where the payload is a bare scalar), with
**`NULL ⇔ component absent`** as the uniform convention. The loader assembles
the non-null component columns into the runtime `Entity.components` bag —
CD14's assemble move, generalized to the durable home; the runtime shape is
unchanged. The decisive property: **the per-write-class concurrency system
(CH4) becomes structurally sound** — each class's write footprint is a
disjoint column set, so a plain `UPDATE SET vitals = …` *cannot* clobber a
sibling class, where a shared jsonb document made that safety a matter of
per-write-path discipline (`jsonb_set` surgery). Structural safety, not
vigilance (the CD1/CD3/CD14 value).

```
entity
├── id, shortId                          — keys (shortId keeps /c/{shortId})
├── ownerId, campaignId, kind, status,   — app/query metadata no engine fn reads
│   builderStep                            (kind: 'pc' now; the CD7 durable-NPC
│                                           seam is this column gaining 'npc')
├── name, portraitUrl                    — column + LIFTED into components at
│                                           load (identity / presentation):
│                                           engine-read AND genuinely queried
│                                           (name is the list sort key), and
│                                           universal — every entity kind has
│                                           an identity/presentation
├── <one column per durable component>   — vitals, skillPool, resources,
│                                           exhaustion, level, path, archetypes,
│                                           mechanics, inventory, manualBonuses,
│                                           sparkLog, virtues (CH17), talents,
│                                           narrative (CH16), … (the exact set
│                                           is pinned by the conformance test,
│                                           not this list); NULL ⇔ absent
├── pronouns, notes                      — app-owned columns: the two content
│                                           fields that are NOT rulebook
│                                           constructs (display metadata +
│                                           scratch); same NULL ⇔ absent rule
└── identityVersion, vitalsVersion,      — per-write-class tokens (CH4)
    inventoryVersion, progressionVersion
    + createdAt / updatedAt
```

The column granule is the **component, not the field** (no v1-style
`virtueExpression`-per-column flattening): the component is already the
domain's decided granule — capability presence, Writer patch, optimistic
prediction, version class — and field-granular columns cannot express
component *absence* without an all-fields-null convention (the level-column
smell again). Column-name disjointness between engine component columns and
app content columns is enforced by the schema itself.

**`level` is a component column, not universal metadata (amends D39's
"`level` also a column" parenthetical).** No query filters or sorts on level
(it appears only in list-card SELECTs), so D39's lifted-metadata column failed
D35's "queryable" test — and failed a structural one: not every entity kind
has a level (parent O12 already anticipated `kind: 'object'` rows, phrased as
"null level"). A *metadata* column whose applicability varies by kind is the
kind distinction leaking into the DDL — per-kind special-case nullability is
the `CombatantRef` arm-audit reborn in the schema. Under CH15 level is simply
one more component column governed by the uniform `NULL ⇔ absent` convention —
no special case to audit. The rule, sharpened: **engine-read facts are
capability-presence (component columns, uniformly nullable); a metadata column
must be universal across entity kinds** (owner, campaign, status, name).
App-feature metadata the engine never reads (`builderStep`) may be
feature-scoped without violating this — the engine cannot leak what it cannot
see.

**The per-column payload contracts are not invented — they are inherited.**
Each component column stores exactly what `rawInputsToEntity` mints for that
key today (golden-mastered against v1 derivation since UNN-533), minus the
components this ADR drops (ailments / battleConditions / partyComposition —
CH8) and plus `sparkLog` (UNN-544 authors `sparkLogSchema`). Storage catches
up to the proven runtime shape rather than defining a new one. Known deltas
from v1 jsonb, all verified (HANDOFF "Verified facts"): InheritanceSlots
renames `sourceCharacterArchetypeId → sourceArchetypeKey` (D36);
`gainedTalents` is open-string in v2; the 9 mechanic per-kind states are
byte-identical.

**Child tables fold into component columns (D11):** `characterArchetypes` →
the `archetypes` column (`{ active, origin, roster: [{ key, rank,
inheritanceSlots }] }` — **keys, not row ids**; `activeArchetypeId`/
`originCharacterArchetypeId` FK surrogates die, and the Atlas rank-up keying by
archetype key is the natural write shape, per the verified `ownedKey` fact) +
the `mechanics` column (per-kind states). `inventoryItem` rows fold into the
inventory/equipment component column (engine-read: resolveInventory, equipped
effects). Knives/chains fold into the `narrative` component (below).
`actionLogEntries` survives as a table re-keyed to `entityId` (an append-only
log is not entity state — CH2).

**`Narrative` is a durable engine component (CH16).** Ancestry, Background,
Backstory, Knives, Chains, and the Identity Traits (Personality / Hopes /
Dreams / Fears / Secrets) are **rulebook constructs** (Character Building
1.4/1.5), so by CH10's species test they are game content and their shape is
game-v2's to declare — one `Narrative` component, one column, identity
version class. This corrects an earlier mis-filing of them as engine-blind app
furniture: "the engine never reads it" was doubtful anyway ("~7 Knives at
creation" is a countable creation constraint UNN-544's completeness validators
may read, and durable NPCs (CD7) are built from Knives/Chains/Identity Traits
per the NPC-design rules — the component is not PC-scoped). `narrative` joins
`ResolvedEntity` as a **pass-through read-unit** (authored == effective — the
CD11 `identity` precedent), so surfaces read it off the same resolved shape as
everything else. It is **not** in `ResolvedComponentRegistry`'s combat
projection path — the encounter snapshot never carries it; owner-vs-public
gating of fields like Secrets is the sheet's app-level read boundary, not the
combat visibility table. Conformance carve-out: `narrative` is the one
component column with no `rawInputsToEntity` precedent (it was never an engine
input) — its schema is authored fresh from the v1 columns' shapes.

**Signed depletion is native (CH3; D9, D10, D26).** `components.vitals.damage`,
`components.skillPool.spSpent`, `components.resources.{hitDiceUsed,
skillDiceUsed, prismaUsed}` are the stored truth; `currentHP`/`currentSP`/
`hitDiceRemaining`/`skillDiceRemaining`/`prismaCharges(+Max)` columns do not
exist. Current values are resolved, never stored. The `pool-write-adapter`
artifact is never built (it only existed for storage-last sequencing), and the
combat router's `no-prisma-max` refusal dissolves — a PC's prisma cap resolves
like every other max. This also dissolves the **one-semantic-per-home interim
rule** (`lib/actions/combat/commit/CLAUDE.md`): durable participants gain v2
semantics (over-max HP as negative damage, signed depletion) as UNN-511 always
intended.

**A load-bearing consequence:** v1's one cross-class write, level-up (bumps
`progression` + `vitals` because raising max meant rewriting `currentHP`),
**collapses to single-class** — under depletion, raising the resolved max
raises the current for free (D9). The `expectedVersions`-pair special case
dies. **Settled as a rules call (Jackson, 2026-07-05, closing Q2): level-up
does not restore vitals** — existing `damage` persists across the level-up and
current rises by exactly the max delta, which is precisely what the depletion
model expresses with zero code.

**`Virtues` is a durable component (CH17).** The four Virtue ranks
(Expression / Empathy / Wisdom / Focus) had **no v2 home at all** —
`rawInputsToEntity` never projected them (UNN-533 left them `CharacterRow`
passthrough; they don't feed the attribute fold), so the fresh-start table
must mint one. They are rulebook progression state with real engine consumers
landing in UNN-544 (`rankUpVirtue`, `eligibleVirtuesForRankUp`, the creation
allocation validators). One `virtues` component column, **progression class**
— which collapses v1's two-class split for virtue writes (builder
`virtuesAllocation` was identity-class, sheet `virtueRankUp` progression); the
split protected surfaces that never actually contend, and one component takes
one class (CH4).

### 2.3 Version guards: per-write-class tokens survive; the class is a Writer fact (CH4; amends D12)

D12 proposed collapsing to a single `version` column + server-side field merge.
**Rejected for the durable character row.** The per-write-class tokens
(UNN-140) protect a real, litigated failure: a debounced narrative save in
flight must not be falsely staled by a vitals click. D12's mitigation
("server-side field merge + reapply-on-stale") is machinery that was never
built and is strictly more complex than four integer columns. Moreover the
as-built combat router **already assumes classes**: `entityRowStore(entityId,
durableClass)` guards the entity's per-class version, and the composite
snapshot fold (UNN-530) reads durable `vitalsVersion`s specifically. The four
tokens move onto `entity` unchanged.

What changes is **where the class is decided**: v1's `EDIT_SURFACE_CLASS`
(surface → class, resolved independently by client hook and server wrapper) is
replaced by **`durableClass` on the Writer registry entry** (component-write
path) and on the column-action definition (app-column path) — the class becomes
a fact of the *write*, declared once where the write is defined, not a lookup
both layers must agree on. Same one-source-of-truth property, one fewer map.
Class assignments carry over as-is (the per-surface-not-per-table judgment
calls — currency riding `inventory` — are preserved).

### 2.4 The durable write factory: CD18–CD20 generalized (CH5; parent D7; combat §2.11)

Character writes join the **descriptor → Writer → Store** router. What combat
proved for the session's two homes, the character surfaces consume with the
home fork already resolved: a durable entity write is
`Writer ∘ entityRowStore`, always.

```
EntityWrite = { entityId, component, op, args, expectedVersion }   // serializable, storage-blind
Writer      = { component; durableClass; applyOp(resolved, args, deps) → Result<Patch> }
Patch       = Partial<StoredComponents>                            // entity-level, may span components
```

**Two factories, composed (CH20).** This architecture is two orthogonal
factories: the **Writer registry** above (WHAT a write does — per-component
pure ops, shared everywhere) and the **Store selection** (WHERE it lands —
durable row vs session blob), which is **already shipped** as combat's
`storeFor` (`lib/actions/combat/commit/`, CD18/CD19). The home distinction's
#9 anatomy: *decided once at participant mint* (a setup entry is stored as
`{ storage: 'durable', entityId }` or `{ storage: 'inline', entity }` — the
stored shape IS the decision, so it cannot be re-decided, only derived from);
*derived at exactly the two boundaries that need it* (`storeFor` server-side
picks the Store; the console's optimistic client picks its prediction
strategy from the same fact); *unrepresentable to the UI* (descriptors carry
no storage field). The character surfaces contain **no fork by design**: the
fork only exists where both homes coexist — inside an encounter. A character
route's load boundary addresses a durable row by construction, so this
section's `Writer ∘ entityRowStore` composition is branchless; adding a home
check at the sheet's door would re-decide a distinction already resolved
upstream (the multiplicity smell itself). **Widget blindness rule:** a
write-capable component receives `dispatch` from its surface's provider
(`useEntityWrite` on character routes, `useCombatantWrite` in encounters) and
never imports a Server Action — the door is chosen once per surface at its
composition root, the home once per participant at mint, and the widget knows
neither.

Runnable-grade sketch: [`write-factory.example.ts`](./write-factory.example.ts)
— written as **three deltas from the shipped combat router**
(`lib/combat/commit/writers.ts`, UNN-520), each cited to its decision: the
patch widens (CH5), `durableClass` spreads across the four classes (CH4), and
the optimistic frame re-folds client-side (CH18). It shows the exemplar
Writers (vitals conforming as the degenerate case; Rest as the
multi-component case; narrative per-field ops; virtues with v1's `log-full`
refusal), the branchless Server Action over the CH15 column commit, and the
reducer-form `useEntityWrite` hook.

- **One Writer registry** for durable component writes, shared by the character
  surfaces and combat's durable arm — the same `vitals` Writer serves a sheet
  HP click and a DM console HP click (the write-side dual of D7's uniform
  render, extended from the encounter to the whole app). Combat's
  `COMPONENT_WRITERS` entries conform as the already-built subset.
- **The patch widens from `Partial<Component>` to `Partial<StoredComponents>`**
  (CH5). Combat never had a cross-component write; characters do — Rest touches
  vitals + skillPool + resources + exhaustion in one transition. Rest is a
  single-home, single-class (`vitals`, v1 precedent), multi-component op — a
  Writer, not a carve-out. The version guard stays exactly one class per
  descriptor.
- **Optimistic prediction rides the Writer, and the client re-folds (CH18):**
  the sheet's dispatch applies `applyOp` locally, merges the patch, and runs
  **`resolveEntity` client-side** to produce the optimistic frame — uniform
  for every write, reconciled on the server round-trip. This is v1's own
  design property ("the optimistic frame is computed by the same pure engine
  the server persists with — no drift") carried forward; it is *forced* by
  CH3, since depletion makes even a pool click's displayed value derived. The
  cheap-algebra middle path (predict `maxHP − damage'` without folding, re-fold
  only for structural writes) is **rejected**: it hand-encodes fold facts
  outside the fold and splits one optimistic strategy into two. One
  `useEntityWrite` hook replaces the per-control `useOptimistic` closures.
  Consequence for the sheet's RSC split: optimistic surfaces are client
  islands holding `(entity, resolved, dispatch)` — the interactive core
  (vitals, rest, mechanics, inventory) is client-side by design; prose
  surfaces (Explore) stay server-rendered.
- **Owner-mode discipline survives structurally** (UNN-226): a descriptor *is*
  a per-field write — the server reads the row, applies the pure op, merges.
  The failure mode ("client composes the full post-state") is unrepresentable
  on this wire.
- **App-column writes stay classic per-field Server Actions** (name, portrait,
  pronouns, notes, builderStep, status, campaignId). The distinction is
  decided **once, at the storage boundary**: engine-component state → the
  descriptor router; app-owned column → a column action. Both compose
  `bumpEntityVersionGuarded` with their declared class. This is not a forked
  write architecture — it is the D35 column/component storage projection
  surfacing at the write layer, the same boundary decided in the same place.
  Narrative edits ride the **router** (CH16): the `narrative` Writer exposes
  per-field set ops + knife/chain list ops, identity class, server-merged —
  the debounced prose autosaves get the same optimistic prediction as every
  other component write.
- **Auth** is the Store's: `entityRowStore` gates `requireOwnerOrCampaignDM`
  (v1 parity — a player writes their own PC; the DM may too); column actions
  gate `requireOwner` except where v1 granted the DM (pools). Unchanged
  posture, one gate per write path.
- `CharacterEdit`, `reduceCharacter`, and the per-field
  `lib/db/writes/*` engine-sandwich wrappers **die with the surfaces that
  dispatch them** (per slice, §4).

**Module residency — one pipeline, two doors (CH5, CH20):** the neutral
pieces (descriptor schema, Writer registry, predictors) re-home from
`lib/combat/commit/` to **`apps/web/lib/entity/commit/`** — combat's
`COMPONENT_WRITERS` are **absorbed into `ENTITY_WRITERS`** (one registry,
superset; the built entries conform as-is) and `combatantWriteSchema` becomes
the **encounter-wire subset of `entityWriteSchema`**, not a parallel
vocabulary. The Server Action + `entityRowStore` + version guard live in
**`lib/actions/entity/`** (a new aggregate folder per `lib/actions/CLAUDE.md`).
What remains in `lib/actions/combat/commit/` is not a second factory but the
**encounter address adapter**: resolve `participantId → locator`, then
durable → forward to *the same* `Writer ∘ entityRowStore` composition the
sheet uses; inline → the session Store. The doors differ only because the
*address types* differ irreducibly (an inline participant exists only inside
its session; the encounter door owns DM auth + the session version) — write
logic exists once, and the whole pipeline is **kind-blind**: nothing in it
ever reads PC vs NPC, so a future durable-NPC surface is a new provider bound
to the entity door, not new machinery.

### 2.5 Combat↔character coupling: the repoints (CH6; CD7, CD19)

Combat's durable arm reads the character row today. CD7/CD19 designed the
durable-entity seam as named-but-unbuilt; **this program builds it at the
foundation slice (S0)**, so combat is never suspended mid-program. The
touchpoints, enumerated:

| Touchpoint | Today | After S0 |
| --- | --- | --- |
| Durable locator | `{ storage: 'durable', entityId }` resolves a `characters` row | resolves an `entity` row (same shape — the locator always said `entityId`) |
| `entityRowStore` | v1 per-field wrappers, absolute columns, interim semantics | native v2 component writes (the interim-rule section of `commit/CLAUDE.md` is deleted with the divergence it described) |
| Console drawer sheet slice (`CombatantDetail.durable`, `CombatantSheetSlice` post-UNN-538) | loads character row + bridge | loads entity row + `resolve` |
| Composite snapshot fold (UNN-530) | folds durable `vitalsVersion`s from `characters` | same fold over `entity.vitalsVersion` |
| Adjust-pools during combat | v1 wrapper | the `vitals` Writer via the router |
| Dungeon roster continuity | PC token `id === characterId` | `id === entityId` (same invariant, new key space) |
| Campaign placement | `characters.campaignId` (+ encounter-lock queries) | `entity.campaignId`; lock queries repoint |

Existing encounters referencing character ids are **wiped at S0** (precedent:
UNN-535's wipe + mint). Between S0 and the builder slice, no durable PCs exist
to place — an accepted, short degraded window (CH6 records the two-worlds
alternative and why it lost).

### 2.6 The read model: per-surface view models, one load boundary (CH7; parent D30; combat kit precedent)

**The standing rule:** a surface composes its view from `ResolvedEntity`
read-units + the row's app-owned fields. There is **no shared flattener** — no
`HydratedCharacter` successor, no `character-view.ts`. A shared view slice may
exist **only** when two surfaces genuinely render the same one (precedent: the
combat kit's `detail-view` vs `roster-view`), and it is named for its content,
never its storage (the F1 tripwire: a view type with a storage-tier
discriminant — `durable`, `row` — is the kind branch resurfacing).

**One load boundary per route** answers "how does a surface get both row-ish
data and resolved read-units": a single loader —
`loadCharacter(shortId, viewer)`-shaped, in `apps/web/lib/character/` — fetches
the row once, lifts columns into components, runs `resolveEntity` **once**, and
returns `{ profile, resolved }`:

- `profile` — the app-owned fields (name, pronouns, portrait, notes, status,
  version tokens), typed off the table.
- `resolved` — the `ResolvedEntity`, from which pure per-surface view builders
  (`apps/web/lib/character/view/*.ts`, mirroring `lib/combat/view/`) shape what
  each tab/section renders. Narrative arrives here as the pass-through
  read-unit (CH16), not on `profile`.

`useCharacter()` (the `HydratedCharacter` provider) is replaced by a per-route
provider carrying that surface's loaded pair; tabs receive view models, not the
world. Derivation happens in the engine, shaping in `lib/character/view/`,
rendering in components — nothing else is allowed to compute (anti-goal 1).

### 2.7 Out-of-encounter state: standalone tracking is dropped (CH8; product call 2026-07-04)

Sheet-standalone Ailments/Battle-Conditions tracking (a shipped v1 feature) is
**removed, not re-modeled**. Ailments and BattleConditions exist only as
encounter-overlay components, exactly as v2's disjointness wall
(`encounter/disjointness.ts`) already insists. The sheet's Combat tab loses the
standalone togglers and `clearCombatState`; the `ailments`/`battleConditions`
jsonb columns have no `entity` twin. Exhaustion — the state that genuinely
persists between fights — is already a durable component and keeps its sheet
control.

`partyComposition` follows: v2 is derive-only (`derivePartyComposition` over
live participants). The stored column dies; **in-encounter** surfaces resolve
lineage-count effect scalers (attack-roll terms like "+X per Fool in party")
from the live roster, and the **standalone sheet previews resolve partyless**
(scaler count 0) — context-true rather than manually maintained. The sheet may
label the affected preview terms "in party: +X" as display copy; it does not
store a party.

### 2.8 Creation-time rules: engine validators + a mint, builder-composed (CH9; UNN-539's finding, UNN-544)

v2 was built for play, not creation — the gap is real and gets engine homes,
**inside existing domains, no `creation/` domain** (the audit's reconciled
call, kept):

- `progression/virtue-allocation.ts` — the creation allocation validator
  family (UNN-544 authors it; that ticket *grows* under this program).
- Path stats / path dice — display + formula exports from `vitals`' domain.
- Initiate gating — derived from archetype tier vocab in `archetypes/`.

**A draft is an entity row from step one** (`status: 'draft'`, `builderStep`
column) — the builder writes through the same write factory as the sheet from
its first keystroke; there is no separate draft store and no draft-shaped DTO.
**Finalize is a validation gate + status flip**, not a storage transition: the
engine exposes the validators; the finalize action runs them against the
resolved entity and flips `status`. This is the durable sibling of combat's
session-factory mint — creation assembles components, the engine validates,
one boundary decides "this is now a playable character."

### 2.9 Content homing: engine catalog with display fields (CH10; reverses the app-map routing; D32 pattern)

Talent and ailment display catalogs move **into the game-v2 catalog** with
display fields, the way skills already carry their descriptions. The earlier
"no engine display catalogs" routing put identical species of content in two
homes (skill prose in the engine, talent prose in `apps/web/lib/ui/`) — a
distinction with no principle behind it, and one that bites the day talents
gain mechanics (plausible). Decided once: **game content lives in the game
package**, display fields included (D32 pattern); `labels.ts` keeps only
UI-vocabulary maps (damage-type names, attribute labels), not content prose.

### 2.10 Surfaces + the fused redesign (CH11; Jackson 2026-07-04)

All four surfaces rebuild on v2-native shapes (non-negotiable). Redesign depth
differs:

| Surface | Read/write rebuild | Visual treatment |
| --- | --- | --- |
| Character sheet | full (new view models, new components) | **full Showtime! redesign** |
| My Characters | full | **full Showtime! redesign** |
| Builder | full (creation rules, write factory, draft-as-entity) | keep current design (Jackson is happy with it) |
| Lineage Atlas | re-point (`buildLineageAtlas(ResolvedEntity)`, rank-up by archetype key) | keep current design |

The command palette re-binds during the sheet slice (it routes through
existing Server Actions today; its vitals batch becomes descriptor
dispatches). Each slice **deletes its old surface on landing** — old
component trees, their `HydratedCharacter` consumption, and their write
wrappers go in the same PR that ships the replacement.

### 2.11 Module layout

```
packages/game-v2/src/
├── progression/            + virtue-allocation.ts, spark.ts (UNN-544)
├── resources/               + rest.ts (UNN-544; depletion-native transitions)
├── catalog/                 + talents/ailments display fields (CH10)
└── (existing domains unchanged; no new top-level domain)

apps/web/
├── lib/entity/commit/       descriptor schema + Writer registry + optimistic
│                            predictors (neutral, client+server) — lifted from
│                            lib/combat/commit; combat keeps its session half
├── lib/actions/entity/      the commit Server Action + entityRowStore +
│                            bumpEntityVersionGuarded (server-only aggregate)
├── lib/character/           the character read side: load.ts (the one load
│                            boundary) + view/*.ts (pure per-surface builders)
│                            — a tightly-CLAUDE.md'd folder, not a package (it
│                            is app view models + glue, not engine)
└── components/…             new surface trees per slice; old trees deleted
```

---

## 3. Consequences

**Gains**

- The character domain's three parallel per-kind flatteners collapse: surfaces
  read `resolve(entity)` read-units, combat reads the same rows through the
  same Writers — "what kind of thing is this" is decided once, at load.
- The shadow engine never forms: `rawInputsToEntity`, `pool-write-adapter`,
  `character-view.ts`, and the bridge are never built or die with their
  surfaces; `apps/web` computes nothing.
- One write architecture app-wide: sheet clicks, builder edits, Atlas rank-ups,
  and DM console writes all route descriptor → Writer → Store, with optimistic
  prediction and per-field discipline structural rather than disciplinary.
- Signed depletion end-to-end kills the absolute-column reconciliation class of
  bugs (current-drags-max, over-max clamps, prisma-cap refusals) and collapses
  level-up to a single-class write.
- The durable-NPC future (CD7) becomes a column value (`kind: 'npc'`), not a
  redesign — campaign-planning tooling inherits a working substrate.
- Fresh-start storage means the riskiest artifact of the old plan — the
  backfill projection with maxHP-resolution-at-migration — simply never exists.

**Costs**

- A degraded window: between S0 (encounter wipe, combat repoints) and S1/S2,
  no durable PCs exist and old-surface characters cannot fight. Accepted
  against expendable data and short slice cadence (CH6).
- The sheet slice is large — a full redesign fused with a full re-plumb. The
  fusion is deliberate (build each surface once), but it front-loads design
  work into an engineering slice; the slice may split into shell + per-tab PRs
  at ticketing (Open Q1).
- Two write species (descriptor router for components, column actions for
  app fields) must be explained once to every future contributor — the CLAUDE.md
  for `lib/entity/commit/` owns that paragraph.
- Widening Writer patches to `Partial<StoredComponents>` weakens the
  per-component type link combat enjoyed; the compensating invariant (one
  version class per descriptor) is enforced by the registry type, and Writers
  remain the only patch producers.
- Dropping standalone ailment/condition tracking is a **feature removal**;
  players who tracked lingering conditions between sessions lose that surface
  (mitigation: encounter overlay is where those live during play, and
  Exhaustion — the durable one — stays).
- Parity suites lose their oracle when v1 dies and must flip to pinned
  fixtures (procedure already written, UNN-548 item 10) — regression coverage
  narrows from "matches v1" to "matches the pinned snapshot."

---

## 4. Build & migration (CH12, CH13, CH14)

Slices are hard cutovers; each deletes what it replaces. Builder-first after
the foundation (fresh-start means creation is the bottleneck — nothing exists
until something can mint characters).

- **S0 — Foundation: entity table + write factory + combat repoints**
  (UNN-511, amended: no longer "last", gains the router generalization and
  repoints). `entity` table (component-column projection, CH15) + conformance
  test pinning the column-set↔registry and per-column payload
  contract; **one pipeline, two doors (CH20)**: `lib/entity/commit` becomes
  the single write pipeline — combat's `COMPONENT_WRITERS` absorbed into
  `ENTITY_WRITERS`, `combatantWriteSchema` re-pointed as the encounter-wire
  subset of `entityWriteSchema`, entity-level patches — and
  `lib/actions/combat/commit/` is reduced to the encounter address adapter
  (locator resolution + session Store) forwarding durable writes to the shared
  `entityRowStore`, now native v2 (interim-rule section deleted); the seven
  §2.5 repoints; encounter wipe; seed + e2e factories mint entities. Old
  sheet/builder keep running on the (now combat-orphaned) v1 tables until
  their slices land.
- **S1 — Builder cutover.** Creation rules land in the engine first (UNN-544,
  grown: virtue-allocation, path stats, initiate gating, sparkLogSchema, rest
  + spark modules). Builder rebuilt on draft-as-entity + the write factory,
  keeping its current design; old builder deleted. From here the app mints
  v2-native characters.
- **S2 — Sheet cutover, fused with the Showtime! redesign.** **Design before
  build:** the sheet + My Characters design exploration runs as a spike
  *during* S0/S1 (throwaway HTML against `docs/brand/brand-guide.md`, iterated
  in the browser, zero code dependencies), so S2's PRs execute a settled
  direction rather than discover one — the program's riskiest work (design
  iteration, which has no compiler) must not live inside its biggest
  engineering slice. Decomposition
  settled (Jackson, 2026-07-05, closing Q1): **one shell PR + one PR per tab**,
  keeping the Combat / Explore / Inventory / Archetypes information
  architecture. The shell PR carries the load boundary, the per-route
  provider, the `narrative`/entity Writers wiring, the command-palette rebind,
  and **the old sheet tree's deletion** (hard cutover at shell time) — and
  should bundle the first tab (Combat) so an entity character never renders an
  empty sheet; the remaining tabs land as their PRs do (nav simply doesn't
  show a tab that hasn't landed). Standalone ailments/BC/partyComposition
  surfaces removed (CH8); `useCharacter`/`HydratedCharacter` consumption dies
  with the old tree.
- **S3 — My Characters redesign + Atlas re-point.** List/cards on `entity`
  queries (kind + status + owner columns); Atlas onto
  `buildLineageAtlas(ResolvedEntity)` + rank-up-by-key writes; old surfaces
  deleted.
- **S4 — Retirement.** Drop `characters` + child tables; delete the remaining
  v1 character-domain code paths; **flip `derive-parity` +
  `derivation-golden-master` to pinned fixtures** (UNN-548 item 10 procedure)
  in the PR that severs the last v1 oracle import. (`packages/game`'s final
  deletion is shared with UNN-540's track; whichever lands last sweeps.)
- **S5 — Rename.** `@workspace/game-v2` → `@workspace/game` (CH13): one
  mechanical PR once v1 is gone — honest names; docs updated in the same PR.

**Test strategy (CH14).** The conformance test pins storage↔component;
creation gets a mint golden-master (finalize output over a max-complexity
fixture); write paths get v1's `rest.test.ts`/`leveling.test.ts` ported
case-for-case (UNN-544) — the only unit net under character writes; each
rebuilt surface gets new e2e via the factory pattern (`e2e/CLAUDE.md` —
factories transfer, specs don't: redesigned UI = new selectors). Recommended
side-ticket: a CI workflow actually running the engine unit suites (neither
engine package's Vitest runs in CI today — Playwright only).

**Ticket disposition (CH19; execute after Jackson approves this ADR — not
before): cancel-and-rewrite, not amend.** Pre-pivot character-domain tickets
are **canceled** and the program's tickets are **written fresh from this ADR**
— a ticket is a contract with its implementer, and amending pre-pivot prose
leaves the old worldview billing a confusion tax (the anti-goal-3 logic
applied to process artifacts). Canceled with linking comments: UNN-511 (→ S0),
UNN-544 (→ E1/E2, resolving the split), UNN-539 (→ S1), and UNN-543/545/546/
548/549 (already superseded; mirror UNN-532/534). **Copy, don't reference:**
each new ticket copies the still-relevant verified findings into its own
description — an implementer never opens a canceled ticket. Fresh slate: S0;
E1 (creation/progression transitions, blocks S1); E2 (rest engine, blocks
S2-shell); E3 (CH10 catalog moves, blocks S2's Explore/Archetypes tabs); S1;
the design spike; S2 × 4 (shell+Combat, Explore, Inventory, Archetypes); S3;
S4; S5. New component *schemas* (virtues/narrative/sparkLog) ride S0 — the
conformance test needs them at table creation; the *transitions* ride E1/E2.
Untouched: UNN-540/547/521/531/537/541/542. UNN-538 survives with a **text
review** (its `HydratedSkill[]` framing is pre-pivot vocabulary; its
combat-side core stands). UNN-510 closes with a supersession comment (shipped
scope done; remaining waves superseded here).

**Docs-canonical restoration.** The stale "build not started" headers on the
parent and spatial ADRs are corrected alongside this ADR's landing; from here
the cutover program treats `docs/engine-v2/` as canonical and updates headers
when code overtakes them.

---

## 5. Deferred scope + Open items

**Deferred (intentionally unaddressed, not forgotten):**

- **Durable NPCs** — the `kind: 'npc'` row + whatever authoring surface mints
  them; this ADR only guarantees the substrate (CD7's seam becomes real).
- **Bestiary engine projection** (UNN-547's game-v2 half) — its own track.
- **Dungeon exploration cutover** (UNN-540) and the **drawer storage-leak fix**
  (UNN-538) — their own tracks; UNN-538's `CombatantSheetSlice` rename is
  assumed by §2.5's table.
- **Undo/action-log UX** — the table survives re-keyed (CH2); whether the
  redesigned sheet keeps the undo affordance is a sheet-slice design call.

**Open items — all resolved or explicitly deferred (Jackson, 2026-07-05):**

1. ~~Sheet slice decomposition~~ — **resolved:** shell PR + one PR per tab,
   Combat/Explore/Inventory/Archetypes IA kept (§4 S2).
2. ~~Level-up restore rule~~ — **resolved (rules call):** no auto-restore;
   `damage` persists across level-up, current rises by the max delta (§2.2).
3. ~~SparkLog shape~~ — **resolved:** v1 semantics carry, which match rulebook
   1.2 exactly: capacity 7; `addSpark` refuses at 7 (`log-full` — the rank-up
   is forced before more Sparks accrue); eligibility = the Virtue appears in
   the log; rank-up clears the log to `[]`. The log's lifecycle is tied to
   **rank-up, never rest** (a first-draft gloss said clear-on-Full-Rest —
   that's the *action log's* lifecycle, corrected 2026-07-05).
   `sparkLogSchema` in UNN-544. The adjacent gap this item surfaced became
   CH17 (`Virtues` component, §2.2).
4. ~~CI unit-test gate~~ — **resolved:** filed as UNN-550 (Infrastructure).
5. **`useEntityWrite` vs `useCombatantWrite` convergence** — **deliberately
   deferred to S2**, when both shapes are concrete; the hooks may ship
   independent and converge in a follow-up without breaking either wire.
   (CH18 makes convergence more likely: both hooks want "predict via Writer →
   merge → re-fold locally.")
6. **Sheet optimistic model for derived values** — **resolved (2026-07-05,
   CH18):** uniform client-side `resolveEntity` for optimistic frames; the
   cheap-algebra middle path rejected (§2.4).
