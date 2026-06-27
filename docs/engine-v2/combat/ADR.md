# ADR: Engine v2 — The Combat / Encounter Subsystem

**Status:** Accepted (design) · build not started
**Scope:** the **non-spatial** combat/encounter subsystem of `@workspace/game-v2` —
the Session container, the pure combat reducer, encounter-overlay components, the
turn loop + initiative + action-economy budget, end-of-turn obligations, the
visibility/redaction projector, the enemy catalog + `getEnemy` port, and persistence.
The Map-Instance **spatial** layer (zones, movement, fog, Engagement) is **explicitly
out of scope** — see _Deferred_.
**Supersedes:** the design intent of v1 `reduceCombatSession` + `player-snapshot`
(the `CombatantRef` union and the kind-keyed projector).
**Supporting artifacts:** [`decision-log.md`](./decision-log.md) (chronological
rationale, **CD1–CD23** for this layer — CD13–CD17 are the spatial-seam revision §2.10,
CD18–CD20 the generalized session write-router §2.11, CD21–CD23 the skills/combat fork §2.12
— plus parent **D1–D45**), the
[parent ADR](../ADR.md), [`requirements/03-encounter-tracker.md`](../requirements/03-encounter-tracker.md)
(R1–R24 acceptance spec), [`requirements/04-views-redaction-dungeon.md`](../requirements/04-views-redaction-dungeon.md)
(RED/ROS/NAME/FAL redaction spec), [`encounter-write-architecture.md`](../encounter-write-architecture.md)
(the corrected write premise), [`_principles-review.md`](../_principles-review.md) (F1–F6).

> This ADR is the **clean current-state synthesis**. Where it cites `CD<n>` the
> chronological reasoning lives in the decision log; `D<n>` cites the parent ADR's
> decisions. Where the ledger leaves a question Open, it is flagged Open below.

---

## 1. Context

This is the **last non-spatial layer** of engine v2: kernel, `resolve`, mechanics,
items, skills, and the combat resolvers already exist; `encounter/` and `visibility/`
are empty scaffolds. The job is to re-home v1's combat-session tracker onto the
capability/component thesis (parent D1) **without changing what combat math the engine
does** — the resolution scope is a **v1-parity tracker** that TRACKS DM-adjudicated
overlay state and computes almost no combat math (only v1's existing light assists:
end-of-turn Burn/Sleep HP ticks, saving-throw/side-effect/frenzy reminders). No new
auto-resolution.

The v1 design has one fatal flaw this layer must kill (the `_principles-review.md`
**F1** meta-lesson — _"a design can be complete AND sound AND still betray its thesis"_):
the closed `CombatantRef` union (`pc | enemy | catalog-enemy`) and its converging
`statblockFrom*` god-object reappearing at the **Session's center**. v1's
`initiative.resolveStats`, `fallen.ts`, `party-composition.ts`, `enemy-vitals`, the
end-of-turn `enemyWorkingHP`, and the redaction projector all branch on `ref.kind`.
Every one of those branches must dissolve into a uniform `resolve(entity)` read or a
capability-presence check, with **zero `kind` branches in engine logic**.

---

## 2. Decision

### 2.1 The Session container + Participant + the one loader boundary (CD2, CD3; parent D29, D11–D13, F1)

The encounter is **not an entity** — it is a Session container of four v1 scalars
(carried verbatim, same names/nullability/vocab) plus an ordered `Participant[]`:

```ts
type Session = {
  round: number //                       1-based, starts at 1
  currentActorId: string | null
  advantage: CombatAdvantage | null //   recorded verbatim, NO normalisation (R2.1)
  firstSide: CombatSide | null
  participants: Participant[]
  mapInstanceId?: string //              loaded by the reduceEncounter root for the seam (§2.10); session reducer touches it never (R24.5)
}

type Participant = {
  id: string //                          stable roster/combatant key (≠ entity.id; the join disambiguator)
  entity: Entity //                      ALREADY dissolved from storage by the loader — no kind/ref
  overlay: OverlayComponents //          the six always-present encounter-overlay components (§2.3)
}
// No storage tag on the pure Participant. The durable|inline home lives at the app boundaries —
// the server's locator map (CD3) + the client view model (optimistic routing) — read by the
// updateVitals client+server command pair (CD18, §2.5), never the pure engine.
```

**The F1 kill — one loader boundary.** A participant persists as a `storage`-tagged
locator, dissolved into a uniform `Participant.entity` at **exactly one** boundary (the
loader). The runtime `Participant` carries **no storage discriminant**; no downstream
function (`resolve`, the reducer, redaction, initiative, fallen, party-composition)
ever names it (CD2). The persisted locator is a **2-arm** union — durable row or inline
blob — **not** a third `catalog` arm (CD3):

```ts
type StoredEntityLocator =
  | { storage: 'durable'; entityId: string } //  PC / reusable NPC — components on the entity row
  | { storage: 'inline'; entity: StoredEntity } // ad-hoc enemy / object / catalog enemy
```

A **catalog enemy is an inline entity** carrying a tiny `catalogRef: { key }` component
(NOT overloaded onto `identity`, which stays `{ name }`) plus its inline working
depletion `vitals: { damage }`. `resolve` folds the catalog definition in via a new
`getEnemy(key)` port read, presence-gated on `catalogRef`, the **same structural way it
folds `archetypes.active` via `getArchetype`** (CD3, CD8). Honest caveat: this is _more_
than the `archetypes.active` precedent — an enemy base also supplies
`vitals.base`(=maxHP)/`level`/`identity.name`, so `resolve` grows a **new
enemy-catalog base layer**. It is still a uniform, presence-gated, kind-free fold.
**Unknown-key contract:** an unresolved `catalogRef.key` seeds `vitals.base = 0` (not
omit, not a nonzero default), reproducing v1 R12.3 max-0 ⇒ R13.2 _unknown ⇒ Fallen_.
Per-`catalogKey` resolution is memoized once per resolve pass (parent O18/D29 dedup):
an AoE on N identical mooks resolves the definition once; each participant keeps its own
`vitals.damage`.

The loader's only job: `durable → fetch row + loadEntity; inline → loadEntity` (a durable
participant gets its `vitals` fetched from the row so `currentHP` resolves + renders). The
storage home (`durable | inline`) stays in the impure out-of-band locator map, read by the
`updateVitals` application-service (CD18) when it routes a write — never copied onto the pure
`Participant`. The impure shell holds that **out-of-band**
`Map<participantId, StoredEntityLocator>` for write-back and the `toCombatantSetup` inverse
projection (R1.5) — a write-only `_origin` token on the runtime `Participant` is
**rejected** as a convention-fenced kind tag that multiplies (CD2).

### 2.2 The pure reducer + event vocabulary (CD4, CD5; parent D29, D21)

```ts
createReduceSession(deps, newId)(session: Session, event: CombatEvent): Session
```

Curried deps-first (mirrors v1 `reduceCombatSession(lookups, newId)`); Immer `produce`
over the whole Session (same-ref no-op for every untouched path, R24.1); one grouped
exhaustive `switch` over `event.kind` with **no `default`** (R24.2); `newId` injected at
the composition root (R24.3). **`deps` is empty** under v2 — the only v1 reducer dep
(`getEnemy`) leaves the reducer (CD8, below), so R24.4 is SUPERSEDED to _"no catalog deps"_;
per the no-vestigial-indirection rule `getEnemy` is dropped from the signature, not kept
as an empty seam.

The 8 non-vitals families port **1:1** from v1 (same kinds/payloads/no-op contracts),
retargeted onto `Participant.overlay`/`Session`, with three honest renames
(`addCombatant→addParticipant`, `removeCombatant→removeParticipant`,
`combatantId→participantId`); `setSide` writes `overlay.allegiance`. Vitals is the one
**restructured** family (§2.5). The union and its slice map:

| Family (slice)           | Events                                                                       | R   |
|--------------------------|------------------------------------------------------------------------------|-----|
| `reduceStartCombat`      | `startCombat`                                                                | R2  |
| `reduceDraft`            | `draftCombatant`                                                             | R4  |
| `reduceTurn`             | `endTurn`                                                                    | R5  |
| `reduceRoster` `[newId]` | `advanceRound` · `addParticipant` · `removeParticipant` · `setSide`          | R6  |
| `reduceOverride`         | `setCurrentActor` · `setActed` · `setRound`                                  | R7  |
| `reduceBattleCondition`  | `adjustBattleConditionAxis` · `setBattleConditionFlag`                       | R8  |
| `reduceAilment`          | `setAilment` · `clearAilment`                                                | R9  |
| `reduceCounter`          | `adjustCounter` · `clearCounter`                                             | R10 |
| `reduceActionEconomy`    | `setActionEconomy`                                                           | R11 |
| `reduceVitals`           | `damageParticipant` · `healParticipant` · `setParticipantMax` (× `hp`\|`sp`) | R12 |

Every documented v1 no-op-same-ref is reproduced (unknown `participantId`; `startCombat`
once `advantage!==null`; `endTurn` null/unmatched actor; draft unknown id; counter
delete-at-0; condition extend/flip/clear; `endTurn` ticks only the acting participant's
durations). `removeParticipant` drops the participant + nulls `currentActorId` only — the
symmetric engagement-sever was **not** done in v1's session reducer either (R6.3 PRESERVE;
engagement rides the Tier-3 occupancy token).

### 2.3 The six encounter-overlay components (CD1, CD10; parent D21, D29)

Overlay state is **six real components**, each carrying `lifecycle: "overlay"` — NOT a
fat `Participant.overlay` god-struct and NOT one god-component. They are
session-blob-resident (never on the durable entity row) and dropped wholesale at
end-of-combat. The `OverlayRegistry` is a **type grouping** (the shared-lifecycle bundle
the principles review cleared as SOUND), not a third runtime registry requiring guards
(F4): overlay components are **always present** per participant (defaulted at
construction, R1.1), so presence-guards buy nothing — they are plain typed fields read via
`participant.overlay.X`. They are homed in their own bag (`Participant.overlay`) to keep
durable/overlay **storage** lifecycles physically separate, **but the visibility projector
consumes the merged read-bag** (resolved durable read-units ∪ raw overlay components ∪ raw
instance components — Position/Engagement, §2.10) so redaction stays exactly one uniform
fold (CD1/CD14 — the F1↔F2/F3/F4 reconciliation).

```ts
interface Allegiance {
  side: CombatSide
}                                  // charmed PC flips side; drives redaction + initiative
interface TurnState {
  movesUsed;
  standardsUsed;
  reactionsUsed;
  turnsTakenThisRound: number
} // pure consumption (D21)
type      Ailments = AilmentKey[]                                          // permissive, idempotent, ordered; Downed coexists
interface BattleConditions {
  attack;
  defense;
  hitEvasion: TriState;
  charged;
  concentrating: boolean
}

type      ConditionDurations = Partial<Record<BattleConditionAxisKey, number>>     // sparse, positive-only
type      Counters = Partial<Record<CounterKey, number>>                   // signed-delta, floor 0, key DELETED at 0
```

`TurnState` is **consumption, SUPERSEDING** v1's `moveAvailable/standardAvailable/
reactionAvailable` booleans **and** `hasActedThisRound` (CD10). The acted-flag ≡
`turnsTakenThisRound > 0` — derived where selectors need it, never stored; this is the
boss-multi-turn substrate. `setActionEconomy(action, available)` writes
`Xused = available ? 0 : budget.X` (observationally identical to v1 at the 1/1/1 base).
BattleConditions edits start a turns-clock (default 3); same-direction extends, flip
resets, clear→neutral+drop; an axis **without** a duration entry is left untouched even if
non-neutral (R5.2). A typed `OVERLAY_KEYS = [...] as const satisfies readonly
(keyof OverlayComponents)[]` (build-time totality, **not** a runtime lifecycle table)
drives the end-of-combat sweep (§2.8). A companion **build-time disjointness assertion**
proves `OVERLAY_KEYS` disjoint from both `keyof ComponentRegistry` **and** a typed
`INSTANCE_KEYS` (3-way, CD14), so the loader's durable∪overlay∪instance read and the sweep
can never shadow each other — structural safety, not vigilance (CD1/CD3/CD14).

### 2.4 Turn loop + initiative + action-economy budget (CD9, CD10; parent D21, D30)

**Initiative (SUPERSEDES R3.4's three-arm switch).** `compareInitiative(participants,
resolve)` reads `resolve(p.entity).components.attributes` **uniformly** — zero kind
branch. v1's `resolveStats` `pc/enemy/catalog-enemy` switch evaporates because the loader
already attached `p.entity` and `resolve` is provenance-agnostic. PRESERVE R3.1–R3.3
(per-side highest Agility/Luck independently; `suggestedSide` tiebreak; both-empty → null;
negative-Agility-still-beats-empty). A participant resolving without `attributes` is
ignored (the v2 analogue of R3.4's "unsupplied/unknown → null → ignored").

**Draft / endTurn / advanceRound / overrides (PRESERVE R4–R7 over the consumption
model).** `draftCombatant` sets `currentActorId`, resets `TurnState` consumption to zero,
clears the `downed` ailment; does **not** set `turnsTakenThisRound` (R4.1); never blocks
an ineligible draft (R4.3). `endTurn` increments the actual actor's `turnsTakenThisRound`
and ticks only that actor's `conditionDurations`. `advanceRound` resets every
`turnsTakenThisRound = 0` + nulls the actor. `addParticipant` enters a joiner with
`turnsTakenThisRound = 1` (queued for next round, R6.2). `setActed(hasActed)` maps to
`turnsTakenThisRound = hasActed ? 1 : 0` (SUPERSEDE R7.2).

**Action-economy budget = the constant 1/1/1 (CD10).** Do **not** add a frozen
`TurnBudget` struct to `TurnState`. `available` is computed against the literal base
constant in the advisory selector (`availableMoves = 1 − movesUsed`, etc.). The multi-turn
substrate is `turnsTakenThisRound` + a base `turnsPerRound = 1` constant; the drafting
selector reads `turnsTakenThisRound < 1`. The reducer **never enforces a turn cap** (R4.3).
The original `TurnBudget` snapshot was **refuted (major)** as anticipatory: every budget
contributor (zone enchantment, boss `turnsPerRound`, action-granting mechanic) is deferred
or unrepresentable in the effects union, and the ADR's own `TurnState` carries no budget
field. When zone enchantment or boss multi-turn lands, _that_ is when the budget becomes a
resolve-fold and the snapshot-vs-recompute question becomes real; today the value is
constant so the snapshot is moot.

The drafting-eligibility selectors (`pendingCombatants`/`nextDraftingSide`/
`eligibleCombatants`, SEL-1/2/3) are homed in `encounter/selectors.ts` and read
`turnsTakenThisRound` (SEL-2's "fewer-acted goes next" reads the count).

### 2.5 Vitals restructure + end-of-turn obligations + fallen (CD6, CD9, CD18; parent D9, D10, D26, D37)

**Vitals = signed-depletion delta events (CD6).** Replace v1's absolute
`adjustEnemyVitals` with `damageParticipant`/`healParticipant`/`setParticipantMax` ×
`hp|sp`. `reduceVitals`: (1) unknown id → same-ref; (2) **the reducer is reached only for
ephemeral vitals** — the impure `updateVitals` router (CD18, below) never dispatches a
durable vitals write *as a session event*, so there is no `vitalsHome` gate here; the
reducer applies over the inline authored `vitals` (R12.4's PC/durable no-op is enforced at
the router, not by the reducer); (3) **pool-component-absent** → same-ref (a
no-`skillPool` catalog enemy no-ops an `sp` event by **capability presence**, reproducing
R12.3/R12.4 "SP ignored" with zero kind check); (4) apply via the existing total
operations — `damage = applyDamage` (signed, unclamped, over-max loan licensed, D10),
`heal = applyHeal` (floors at 0, no-ops over-max), `setMax` writes `component.base`
(effective max is **resolved**, so lowering base re-derives `currentHP` for free — D9
**eliminates** R12.2's current-drags-max reconciliation). No floor on stored
`damage`/`spSpent`; the floor lives in resolve + each operation's clamp.

**Storage routing is the client+server `updateVitals` command pair, not a flag on the pure
Participant (CD18).** The decision _"ephemeral vitals → reduce + `saveEncounterSession` vs
durable vitals → the per-field entity action"_ is owned by a **client+server `updateVitals`
command pair** — **not** a purely server-side service: because the UI updates
**optimistically**, the client must predict the write. A client dispatch in the headless
console optimistically applies (ephemeral → run the pure session reducer locally; durable →
update the local PC-vitals display) and selects the write; a paired Server Action validates,
authorizes (DM-only vs owner-or-DM), and persists. The storage home is read on **both**
boundaries — the **client view model** (optimistic routing) + the server's locator map (CD3,
persist routing) — and the pure reducer + runtime `Participant` shed any storage tag (the
earlier `vitalsHome` field is **removed**; the fact lives at the app boundaries, not the
engine).
This is the **write-side dual of D7**: a capability-uniform *render* model (one `HealthBar`
for any entity) with a *forked write* model is internally inconsistent, and the inconsistency
surfaces at a unified edit surface (the DM console's all-combatants HP list) where the widget
would re-introduce the very storage branch D7 eliminated. `updateVitals` absorbs it, so
"render every combatant the same" extends to "write every combatant the same." Routing is
**impure** (server half picks a persistence path + auth; client half picks the optimistic
strategy — not a reducer), so it lives in the app layers (Server Actions + the headless
console) — **independent of CD16's** pure composition tier. The only residual reducer
guard is **capability presence** of an inline authored `vitals` (a thesis-pure no-op, never a
storage flag); `currentHP` for a durable combatant still renders because `resolve` reads its
row-fetched `vitals` (§2.1) — rendering never needed a write-routing flag.

**End-of-turn obligations (CD9 — DISPLAY-ONLY producers, reading resolved entities
uniformly).** `ailmentHpDelta`: Burn = `-floor(maxHP*10/100)`, Sleep = `+`, Despair = 0
(PRESERVE R14.2) — emitted as a **uniform delta intent the DM applies** ("apply this delta to
participant X"), not auto-applied; `maxHP` read from `resolve(p.entity).components.vitals.maxHP`.
The producer no longer pre-routes by storage — it emits the same intent for every combatant
and the shell hands it to `updateVitals` (CD18), which places it (durable → entity action,
ephemeral → reduce). This SUPERSEDES R14.4's producer-side `null for a PC / concrete enemy-HP
value for inline` with one routed delta intent.
PRESERVE R14.1 (held-flags/active-durations canonical-order FYI), R14.3 (empty on unknown
actor), R14.5 (frenzy reminder, pain before decrement).

**Fallen + party composition (SUPERSEDE by uniformity, CD9).**
`fallenCombatantIds(participants, resolve)` recomputes `hp<=0` fresh each read from
`resolve(p.entity).components.vitals.currentHP` **uniformly** (zero ref-kind branch); a
participant resolving without vitals ⇒ not-Fallen; unknown `catalogRef.key` ⇒ base 0 ⇒
Fallen (CD3); revive (HP back >0) drops it with no event.
`derivePartyComposition(participants, side, resolve)` tallies PCs by Lineage, identifying a
PC by **capability** (presence of a resolvable lineage-bearing archetype), not
`ref.kind==='pc'`; a participant with no Lineage is skipped. NAME-3 disambiguated labels
are owned by the encounter view layer (`selectors.ts`), reading resolved `identity.name`.

### 2.6 Visibility / redaction (CD11, CD12; parent D20, D25, F2)

`relationship(entity, viewer) ∈ {own, ally, opponent, spectator, dm}`, computed **once**
per (entity, viewer): dm-first short-circuit; then **own** iff
`viewer.ownedEntityIds.has(entity.id)` (ownership **capability**, not kind — a charmed PC
reads `own` to its controller and `opponent` to its old party); spectator iff
`viewer.side` null; no-allegiance ⇒ spectator (least-privilege fail-safe); same-side ⇒
ally; else opponent.

```ts
type Relationship = 'own' | 'ally' | 'opponent' | 'spectator' | 'dm'
type Visibility = 'public' | 'drop'

// ONE total table — the single source of truth (F2). visibleFor takes NO entity argument.
const VISIBILITY: Record<ProjectableKey, Record<Relationship, Visibility>>
```

`visibleEntity(entity, viewer)` folds the table over the **merged** read-bag (resolved
durable read-units ∪ overlay components ∪ instance components, CD1/CD14); `"drop"` omits the key **structurally**
(absent on the wire, never null — PRESERVE v1's RED-4 contract). Redaction runs over the
**resolved** entity (never authored `damage`/`spSpent`). Unlisted keys default to `drop`
(defence in depth). **Cells:** `attributes` + `affinities` are the **only two drop rows** —
public to `own`/`ally`/`dm`, DROP to `opponent` **and** `spectator` (RED-4); every other
component (identity, vitals, skillPool, the overlay components, allegiance, **and the
projected `position`/`engagement`**, §2.10) is public to all
five arms (RED-2/RED-3). A `presentation` row carrying `portraitUrl` is public to all five
(its omission would default-drop `portraitUrl` for every viewer — a PRESERVE break RED-3/
PV-2/DRD-3). `identity` is added to `ResolvedComponentRegistry` as a **pass-through**
(authored == effective) so name has a resolved surface to redact over and is a public table
row (NAME-1/NAME-4 fix). The `engagement` row is **public to all five arms** — a real read
of the projected Engagement component (CD17), added BACK now that Position/Engagement are
projected into the bag (§2.10) — reversing the first pass's removal of it as a scope leak;
`position` is likewise a public read-unit. Future fog-redaction of `zoneId` (RED-9c) is a
POST-FOLD field transform the spatial projector composes OVER this binary table, never a
third verdict in it.

`projectEncounterSnapshot(session, viewer, meta) → EncounterSnapshot` (CD12) sits above
`visibleEntity` as a **default-deny whitelist** of session-level fields
(`status, name, campaignShortId, version, round, currentActor:{id,name,side}|null,
combatants[]`) — viewer-uniform (RED-1 fields are identical for every viewer; the DM
console reads the full session directly and never goes through this projector). Two
single-purpose passes: the envelope selects session fields (never consults relationship);
`visibleEntity` redacts each combatant (the only relationship-driven step). `pendingEffects`
is excluded by not being whitelisted (display-only DM producer, never to watchers).
`engagedWith` is a **real read** of the projected Engagement component (CD17) via the v1
`engagedWith()` accessor — `[]` *structurally* when Free or mapless (capability absence), so
the wire is byte-identical to the old stub when Free, no migration. `type VisibleCombatant
= Entity` (no kind discriminant). The **non-spatial** snapshot is intentionally NOT
RED-1-complete: the spatial Tier-3 projector **composes over** this one (adds spatial
fields + fog-clamps `zoneId` after this envelope produces the combatant list).

### 2.7 Enemy catalog + the `getEnemy` port (CD8, CD3; parent D32, D37, F1)

Add `getEnemy(key: string): Entity | undefined` to `kernel/ports.ts` (currently absent).
It returns an **authored `Entity`**, NOT a bespoke `EnemyDefinition` struct — a second
nominal type would recreate the `CombatantRef`-arm multiplication (the F1-critical call).
The Entity carries only flat-base components:

```ts
{
  identity: {
    name
  }
  ;
  attributes: {
    base
  }
  ;
  affinities: {
    base
  }
  ;
  vitals: {
    base: maxHP, damage
  :
    0
  }
  ;
  level: {
    value
  }
  ;mechanics ?
}
```

— **no** path/archetypes/manualBonuses/equipment/resources/exhaustion, and **no
`skillPool`** for shipped catalog enemies (the rulebook gives monsters no SP; `sp:null`
falls out structurally from component absence, satisfying RED-4/ROS-5 with zero kind
branch — never author `skillPool:{base:0}`). A free-entered inline enemy that DOES author
`skillPool` surfaces a real pool automatically (presence = capability). `catalog/enemies/`
holds family-grouped authored entities + a `defineEnemy` helper; `catalog/index.ts` wires
`getEnemy`. The kept Burn/Sleep end-of-turn tick reads `maxHP` from
`resolve(entity).vitals.maxHP`, NOT a reducer port — which is why the reducer needs no
catalog dep at all (R24.4 SUPERSEDED).

### 2.8 Persistence / write-architecture (CD7, CD18; parent D11–D13, D29, D27)

Storage axis = **lifecycle**, generalizing v1's existing PC/enemy split, honoring the
corrected premise (PC vitals were **never** a combat event). The choice between paths (a)
and (b) below is owned by the **client+server session write-router** (CD18→CD19, §2.5/§2.11) —
`updateVitals` is its `vitals` writer — **not** by the UI widget and **not** by a flag on the
pure Participant. The widget expresses intent; the client dispatch optimistically routes (reading
storage home off the view model) and the paired Server Action persists + authorizes (reading the
locator map):

- **(a) Overlay + ephemeral vitals → session blob**, single `version` token, one
  `bumpEncounterVersionGuarded` (the DM is the sole blob writer, D12). Reducer stays pure;
  `updateVitals` (ephemeral arm) does `reduce → saveEncounterSession(id, next, expectedVersion)`.
  An AoE on N mooks is one write.
- **(b) Durable combatant vitals (PC + reusable NPC) → entity row** via the `updateVitals`
  durable arm — a per-field owner-mode write (read row → merge `components.vitals.damage` →
  write, bump entity version), **never** the combat reducer.
- **(c)** The rare 1+N multi-durable event uses existing `guardMany`.
- **(d) Instance state → the Map-Instance occupancy token** (Position/Engagement, CD13) —
  a THIRD lifecycle, with its own `mapInstances.version`, shared with exploration, written
  only by the spatial reducer.
- **End-of-combat sweep:** drop every overlay-tagged key from every participant, driven by
  the typed `OVERLAY_KEYS` const (build-time `satisfies` totality — a new overlay component
  without an entry fails to compile). Durable state (`vitals.damage` on a row, exhaustion
  D27, resources) is **not** swept; **instance** state is **not** swept either — provably
  disjoint from `OVERLAY_KEYS` (3-way, CD14), so the sweep structurally cannot touch
  positions. Combat-end is therefore a **composed** action (CD16, §2.10): the overlay sweep +
  a spatial `pruneCombat` (frees engagement, clears enchantment, KEEPS survivor zoneIds) +
  the status flip, atomic over both version tokens.

`packages/game-v2` ships the **engine-side shapes only** (pure reducer + `OVERLAY_KEYS` +
loader/sweep over plain data); the entity-row Server Action, `guardMany`, and version-guard
live in `apps/web`. **Realtime:** durable-vitals writes bump an entity version + ping the
per-entity channel; the snapshot's composite version folds an entity-version dimension over
the durable participants — generalizing v1's existing PC-channel split, no new machinery.

### 2.9 Folder layout

```
packages/game-v2/src/
├── kernel/ports.ts          + getEnemy(key): Entity | undefined        (CD8)
│       ResolvedComponentRegistry  + identity pass-through               (CD11)
├── catalog/enemies/         family-grouped authored entities + defineEnemy; wired in catalog/index.ts (CD8)
├── encounter/               (scaffold) session.schema · participant · overlay shapes + OVERLAY_KEYS
│                            · instance shapes (Position/Engagement) + InstanceRegistry + INSTANCE_KEYS (CD13)
│                            · loader (assembles durable ∪ overlay ∪ instance; pipes SpatialReads → effects) (CD14/CD15)
│                            · spatial-reads port (zoneOf · activeEnchantment) (CD15)
│                            · reduce-session + reduce/* · reduce-encounter (composition wrapper) (CD16)
│                            · session-factory · initiative · selectors · end-of-turn · fallen · party-composition
└── visibility/              (scaffold) relationship · VISIBILITY table (incl. position/engagement rows) · visible-entity · project-snapshot
```

The impure `commit/` write-router (CD19, §2.11) is a **client+server pair split three ways** across
`apps/web` — not a single `actions/` module:

```
apps/web/
├── lib/combat/commit/           Writers (pure per-component ops + durableClass) — neutral, client+server
├── lib/actions/combat/commit/   the two Stores + Server Action (commit · auth · version-guard) — server-only
└── components/combat/           useCombatantWrite — optimistic client dispatcher; sibling of useCombatConsole,
                                 composes dispatch-event [ephemeral] + dispatch-character-write [durable]
```

### 2.10 The spatial seam — Position/Engagement + the read-interface + composition (CD13–CD17; parent D28, D29)

Combat is designed **over a spatial substrate**, not spatial-blind — a **one-way
dependency**: combat reads spatial; spatial stands alone (the Map-Instance runs in dungeon
exploration with no combat session). The heavy spatial **internals** (geometry, fog/reveal,
the movement/engagement transitions, the map editor) stay deferred to the spatial ADR (§5);
this section pulls the narrow **read seam** forward.

**Position + Engagement are instance-lifecycle components (CD13).** `Position = { zoneId }`
and `Engagement = { free } | { engaged; targetCombatantIds }` (v1's union — symmetric,
same-zone) carry a **third lifecycle, `instance`** (delve-scoped), beside durable and
overlay. Their authoritative home is the Map-Instance occupancy token; they are **written
only by the spatial reducer** (combat never writes them; the symmetry invariant stays in the
spatial engagement-graph). They live in a sibling **`InstanceRegistry`** rooted in
`encounter/` — mirroring the `OverlayRegistry` (CD1), **not** the kernel `ComponentRegistry`
(the corrected error: a kernel-registry entry would force a durable load-seam and couple an
exploration-shared concern to the durable schema). The decisive reason the lifecycle must
exist: v1's `pruneCombat` keeps survivor zoneIds while freeing engagement at combat-end —
position survives the overlay sweep but dies with the delve, which the two-lifecycle model
can't express.

**The loader assembles a three-home merged bag (CD14).** The one loader boundary is reframed
from *dissolve* to **assemble**: the read-bag = resolved durable read-units ∪ raw overlay
components ∪ **raw instance components**, the instance keys **injected after `resolve` runs**
(never fold inputs), exactly as overlay is. Each home keeps a **separate write path + version
token**; the loader only merges for read. Build-time **3-way disjointness** (`INSTANCE_KEYS`,
`OVERLAY_KEYS`, `keyof ComponentRegistry` pairwise `∅`). The F1 kill holds — nothing
downstream names a storage home or token.

**The read-interface is a narrow one-way port (CD15).** Combat reads spatial through an
injected `SpatialReads { zoneOf(participantId): string | undefined; activeEnchantment():
ZoneEnchantment | null }` — **not** a spatial-state import. The loader pipes
`zoneEnchantmentEffects(activeEnchantment(), zoneOf(p))` into `ResolveContext.effects` →
`resolveEntity`, **un-deferring Toccata** into `pendingEffects` (display-only per parity). v2
is already wired (`zone-enchantment.ts` + `resolveEntity`'s `effects` channel); only the
loader projection is new. This is the **only** engine-modeled combat→spatial read — ranges
stay DM-adjudicated vocabulary, opportunity-attacks stay prose (no `validTargets`, no auto
reactions), and the action budget stays the constant 1/1/1 (Tarantella's grant is prose,
returns `[]`).

**The composition is a designed seam (CD16, Leaning).** A `reduceEncounter` tier over
`EncounterState = { session, instance }` routes combat events → the session reducer, spatial
events → the spatial reducer, and **owns the cross-cutting events** in one `guardMany`
transaction over the two version tokens, driven by a changed-rows diff: birth co-mints
session + instance from one `setup[]` (R1.3 — establishing `participantId === token key` at
birth); `addParticipant ↔ addOccupant`, `removeParticipant ↔ removeOccupant` (the symmetric
engagement-sever is `removeOccupant`'s spatial obligation, R23.2 — the composition calls it
but never performs it itself); `startCombat` placement-gate (a shell precondition — the
wrapper reads no geometry field); combat-end the composed sweep+prune+flip (§2.8). The
`instance` field stays **opaque** (the spatial ADR owns its internals). _Leaning_: whether to
ship a literal pure wrapper (recommended) vs a documented shell pattern, and whether
combat-end is a pure `endCombat` arm vs shell-composed, are open (decision-log Q6/Q7).

**`engagedWith` un-stubs (CD17).** Now that Engagement is a real projected component, the
snapshot's `engagedWith` is a real read folded by the CD11 table as public-to-all (RED-2),
`[]` structurally when Free/mapless — byte-identical to the old stub when Free.

**Over-constraint guard.** The committed shapes are the **minimum** combat needs and do not
box in the spatial ADR: `Position = { zoneId }` pins no coordinate model; `SpatialReads`
names only two reads (the spatial ADR adds adjacency/reveal as separate seams); `instance`
stays opaque. The single forward constraint — a singleton `activeEnchantment()` and the
single-zoneId enchantment equality — matches v1/v2 exactly and is engine-owned (a future
multi-zone model updates the helper, not the component); flagged for the spatial-ADR author
(Q8). The one-way dependency should be made **structural** by a depcheck import-direction
rule when the spatial folder lands (Q11).

### 2.11 The session write-router — one registry for every component write (CD18–CD20; parent D7)

`updateVitals` (§2.5) was the first instance of a general pattern, not a vitals special-case: a
boss's **Mechanic**, a friendly-ephemeral NPC's **SkillPool**, and **Prisma** all face the same
storage-home fork, and only the *plumbing* differs by home. So it generalizes to **one
registry-driven impure write-router** (CD19), named **`commit/`** (the `Store`'s verb). It is a
**client+server pair, not a single `actions/` module** (the UI predicts optimistically), so it splits
three ways by concern: the pure **Writers** → neutral `apps/web/lib/combat/commit/` (importable by client
prediction + server commit); the two **Stores** + the Server Action → `apps/web/lib/actions/combat/commit/`
(commit · auth · version-guard, server-only); the **optimistic client dispatcher** (`useCombatantWrite`) → a
shared hook in `components/combat/`, a **sibling of `useCombatConsole`** (not welded inside it), composing
the existing `dispatch-event` (ephemeral session) + `dispatch-character-write` (durable row) paths — the
router is what re-unifies the two homes v1 had to split.

**The router = Writer ∘ Store (CD19).** `applyCombatantWrite(ctx, { participantId, component, op, args })`
— the write carries **no storage field**. The home is the **stored shape** (a participant is stored as an
inline `entity` (ephemeral) or an `{ entityId }` reference (durable)), so it's **derived, not a tag** (CD3
tightened); server and the routing client (which holds its own local session) derive it the same way. A
write is then a per-COMPONENT **`Writer`** ∘ a per-HOME **`Store`**:

- **`Writer`** — a `COMPONENT_WRITERS` registry keyed on component, over the engine's existing pure ops +
  mechanics registry (no second engine registry — F1); each entry is just
  `{ component; durableClass; applyOp(entity, args, deps) → Result<Partial<Component>> }` — the only per-component code.
- **`Store`** — a factory returning a shared `{ read; commit(patch) → { token, value, channel }; auth }`.
  Exactly **two**, written **once**: `sessionStore` (dispatches a router-only `ComponentWriteEvent` through
  the reducer + `saveEncounterSession`, CD4 single pure session-writer; `encounter.version`; DM-only) and
  `entityRowStore(entityId, durableClass)` (per-field owner-mode write; the entity's per-class version;
  owner-or-DM). `storeFor(p, writer)` picks one from the derived home; the router body has **no branch** —
  `store.commit(writer.applyOp(store.read(), …))`.

This is **Abstract Factory + Strategy**, not DI — so `auth`/`token`/`channel` live on the two Stores
(written once), **not** duplicated on every Writer. **Built now:** vitals, skillPool, resources,
mechanics; **deferred** (router-shaped, no consumer): exhaustion, equipment; **excluded:** overlays
(generic wire), spatial (spatial reducer), **archetypes/form-swap** (an `applyForm` entity transform — its
own path), derived units. Runnable sketch: [`write-router.example.ts`](./write-router.example.ts).

**The honest shape (critics refuted the naive premise).** Not a uniform `(Component, args) →
Component`: ops return **patches**, and `resources`/`mechanics`/`equipment` need injected context, so
`applyOp` takes a per-writer **`WriterDeps`** bag supplied identically by client + server. **Mechanics
is two-level** (outer by home, inner by `MechanicKind`), its transition crossing the wire as a
**serializable descriptor**, never a closure.

**Structural-ephemeral-only (CD19, amends CD5).** Component-write events **leave** the generic
`CombatEvent` union into a **router-only `ComponentWriteEvent` family excluded from
`ApplyCombatEventSchema`** — so a durable target is *unrepresentable on the generic wire*. The server
locator is authoritative; a contract test + an un-exported `toSessionEvent` close the arm-selection
risk. This is the structural form of the "ephemeral-only by construction" claim §2.5 left implicit.

**The multi-home batch (CD20) is retired — a cast is single-home (CD21).** This section once carried a
multi-home `applyCombatantWriteBatch` on the premise that a skill cast writes a *set* across combatants
(caster SP + target HP + a mechanic). The premise was wrong: casting spends **only** the caster's SP/HP
and writes nothing else (v1 parity, §2.12) — so a cast is a *single* `applyCombatantWrite`, and no parity
action needs cross-home atomicity (DM-applied damage and the R14.4 ticks are each independent single
writes). The batch shape was sound but has no consumer; re-open only if a genuinely atomic cross-home
action ever appears. Casting is instead the canonical case that **validates** the single-write router
above: a home-agnostic `skillPool` (or `vitals`) Writer that lets an ephemeral boss spend SP through the
same path a PC uses.

**Honest cost.** The two Stores are written **once**, so the per-component surface is just a Writer — but
adding a writable component is still a **two-layer edit** (a pure reducer slice in game-v2 + a Writer entry
in apps/web), which the registry does not collapse to one. The server `lib/actions/combat/commit/` is a
deliberate two-auth-gate aggregate (the gates live on the two Stores; a nested CLAUDE.md legitimizes the
exception).

---

### 2.12 Casting + the skill preview (CD21, CD22, CD23; parent D7; PR7 resolvers)

**Casting = one caster-side write, not a session event (CD21).** Pressing Cast resolves the skill's cost
and applies it as a **single** component write on the caster — no target write, no damage roll, no auto
side effect, no `cast` reducer event (v1 parity: v1's `castSkillAction` writes the caster's vitals row and
nothing else). Two decisions are made **once** at the cast boundary (Code Style #9): the cost *kind* picks
the **Writer** (`applyCast → { pool, amount }` → `skillPool.spend` for SP, `vitals.damage` for an
HP-percent cost), and the caster's derived home picks the **Store** (PC → `entityRowStore` on the existing
`cast` surface; ephemeral boss → `sessionStore`). Casting is thus the keystone that **validates §2.11's
single-write router** while **retiring §2.11's batch**: a home-agnostic single write that lets an
ephemeral combatant spend SP (which v1 could not model). Action economy stays decoupled (the DM flips
`TurnState` separately — v1 parity); no cast is logged (v1 has none).

**The preview = target-aware, viewer-redacted, display-only (CD22).** The engine adds **no targeting for
resolution**, but surfaces a display-only preview that updates when a player selects a combatant to
preview against. The selection is **transient UI state** — never written, never an event; the Cast it
precedes still spends only the caster's SP. With a target selected, each skill re-resolves against that
target's context: the target's Hit/Evasion condition folds into *your* attack-roll preview as a concrete
modifier (enemy under Sukukaja → −7), and the target's zone enchantment drives skill riders (Cantata in a
Forte-2 zone → +2, Rage on 20+). `resolveAttackRoll` already returns `{ total, sources[] }`, so the
breakdown is shaped; the preview extends the sources with target-relative terms. **The keystone: the
preview runs over `visibleEntity(target, viewer)` (§2.6), so it cannot leak** — a condition hidden from
players is absent from a player's preview, while the DM gets the true matchup; player- and DM-facing
previews of one cast may legitimately differ. This is v1's `hydrateCharacter(zoneEffects)`
context-injection (§2.10 `SpatialReads → ResolveContext.effects`) parameterized by the *selected target*
rather than only the caster's ambient zone — not a new pattern. Seam: `previewSkill(skill, resolvedCaster,
visibleTarget | null, spatialReads) → { cost, attackRoll{total,sources[]}, riders[] }`, homed in
`encounter/` (`skills/` stays encounter-agnostic, one-way like §2.10); `visibleTarget = null` degrades to
the caster-only affordability floor v1 already shows. Display-only at every tier — *potential* ("would get
+2"), never *actual* ("dealt 14").

**Structured rider data is stubbed (CD23).** The skill-specific riders (Cantata's +Forte / Rage) need
structured `zoneConditionalEffects` the Skill does not yet carry (today: authored prose). CD22 commits the
`riders[]` *seam*; the *shape* is deferred to its own skills-data ticket — cheap to get wrong
(display-only), and almost certainly a reuse of the context-injection seam, so committing it now buys
nothing. The target-*condition* modifiers (the −7) need no new data and work immediately. **Enchantment
scope (rules):** a zone holds one enchantment and a Bard holds one, but globally there may be many (one per
Bard) — which is *why* the target-click preview beats a board-wide strip: it scopes the rider to the one
zone that matters.

---

## 3. Consequences

**Gains**

- The `CombatantRef`/`ResolvedStatblock` ghost (F1) is **structurally dead**: the closed
  `pc|enemy|catalog-enemy` union collapses to a uniform `Entity` at one loader boundary;
  every former `ref.kind` branch (initiative `resolveStats`, fallen, party-composition,
  enemy-vitals, end-of-turn `enemyWorkingHP`, redaction's enemy arm) becomes one
  resolve-over-uniform-entity read or a capability-presence check.
- Redaction is one auditable, total `(component × relationship)` table instead of v1's
  hand-coded two-arm `projectPlayerSnapshot`. Strictly-better outcomes fall out free: a
  charmed PC is correctly hidden from its old party, an NPC ally reveals stats. A forgotten
  component is a compile error, not a leak.
- Signed depletion eliminates v1's lower-max-drags-current reconciliation entirely; the
  over-max loan / Fallen-revive cases fall out of the existing vitals operations with no new
  combat math.
- Capability-by-presence collapses three v1 special-cases into one fact: an enemy with no
  `skillPool` yields `sp:null` structurally (RED-4), no-ops sp writes, and has no cost gate.
- Persistence honors the corrected premise: overlay + ephemeral vitals are cheap
  single-version session writes; durable vitals stay on their own row+version+channel; the
  end-of-combat sweep is a total `OVERLAY_KEYS` drop with compile-time totality.
- The non-spatial layer composes cleanly under the future spatial ADR: the snapshot envelope
  is wrapped (not edited); `mapInstanceId` is inert; `turnsTakenThisRound` is the
  boss-multi-turn substrate already wired. No session-shape migration is forced by Tier 3.

**Costs**

- A new enemy-catalog base layer in `resolve` (`getEnemy(key) → vitals.base/level/identity`)
  is genuinely _more_ than the `archetypes.active` precedent — a real new fold input, and
  `resolve` now depends on the `getEnemy` port. `identity` becomes a resolved pass-through (a
  small registry growth).
- Two storage realities (durable row vs inline blob) and an out-of-band origin map the impure
  shell must maintain; the durable-NPC entity table is a specified-but-unbuilt seam (durable
  = PCs only until the NPC PR).
- `vitalsHome` is a two-valued storage-locator the ADR must keep _arguing_ as a lifecycle fact
  (§2.5), or a reviewer reads it as the F1 ghost in a costume — a documentation obligation that
  recurs anywhere the durable/inline distinction must be read.
- The golden-master can't be a literal v1 event replay: v1 absolute-vitals sets must be
  translated into v2 signed deltas in the parity harness, and ported enemy numbers are
  captured as committed fixtures (D32 forbids cross-package imports).
- The action-economy budget ships as a hardcoded 1/1/1 constant; when zone enchantment or
  boss multi-turn lands the budget must be re-homed as a resolve-fold — built minimally now,
  properly later.
- Five relationship arms where only two cells differ today (spectator/opponent are
  byte-identical) and a dead `dm` table column unreachable from the watch projector —
  intentional headroom matching D25's relationship set; a reviewer must be told not to
  collapse them.

---

## 4. Build & migration (parent D14, D15, D23, D32)

**Behavior is the acceptance spec** (R1–R24 + RED/ROS/NAME/FAL). Each requirement is tagged
PRESERVE (reproduce exactly) or SUPERSEDE (a decision changes it, citing the CD-number) —
see the map below. Build slice-by-slice red→green; **golden-master** every ported enemy
(`resolve(getEnemy_v2(key))` equals v1 `statblockFromEnemy` numbers, captured as committed
fixtures — no `@workspace/game` import, D32) and the reducer (translate v1 absolute-vitals
events into v2 deltas in the parity harness).

### Build slice order

0. **Kernel seam** — `getEnemy`; `identity` → `ResolvedComponentRegistry` (pass-through);
   enemy-catalog base layer + `catalogRef` component. Test: resolve output identical
   with/without overlay components present (guards CD1's resolve-ignores-overlay seam).
1. **Enemy catalog port** — port v1 defs to `catalog/enemies/` as flat-base entities +
   `defineEnemy`; golden-master each. Unknown-key ⇒ `vitals.base 0`.
2. **Session + Participant + overlay shapes** — six overlay components + construction
   defaults, `OVERLAY_KEYS` (satisfies keyof), session-factory.
3. **Loader + dissolution boundary** — `loadSession` (durable|inline → uniform
   `Participant.entity`); out-of-band origin map for write-back/R1.5; memoized
   per-`catalogKey` resolution. Contract test: loader sets `vitalsHome` correctly
   (durable → `"durable"` _with_ `vitals` attached; inline → `"inline"`); round-trip
   load→save preserves the locator; no storage tag reachable downstream.
4. **Pure reducer** — `createReduceSession` + all slices; signed-depletion deltas,
   `vitalsHome` lifecycle gate + capability-absence SP no-op; golden-master against v1
   (translating absolute sets to deltas); cover every no-op-same-ref.
5. **Turn loop + derived selectors** — `compareInitiative`/`fallenCombatantIds`/
   `derivePartyComposition` over `resolve` uniformly; `selectors.ts`; end-of-turn obligations
    + reminders as display-only producers; action `available` against the constant 1/1/1.
6. **Visibility** — relationship resolver + the total table (attributes/affinities the only
   drop rows, dropped to opponent **and** spectator; identity + presentation public) +
   `visibleEntity` + `projectEncounterSnapshot` + `engagedWith:[]` stub. **Release-gate
   security test:** seed an opponent WITH attributes+affinities, assert
   `"attributes" in projected === false`; assert own/ally still see them (RED-3); assert
   `portraitUrl` survives for every viewer (presentation row); assert charmed-PC
   own→public / opponent→drop.
7. **apps/web persistence + realtime** — guarded `saveEncounterSession` (single version);
   end-of-combat sweep via `OVERLAY_KEYS`; durable-vitals per-field owner-mode action;
   encounter-channel + per-entity-channel pings; composite snapshot version. (Durable-NPC
   entity table stubbed; durable combatants = PCs for now.)
8. **Casting + preview** — `applyCombatantWrite` with the `skillPool`/`vitals` Writer for the
   caster-side cast (CD21, no session event); `previewSkill(skill, resolvedCaster, visibleTarget |
   null, spatialReads)` over `visibleEntity` (CD22, display-only; target-condition modifiers only —
   `zoneConditionalEffects` riders stubbed, CD23). Test: cast spends only the caster's pool; an
   ephemeral-boss cast routes to `sessionStore`; a preview against a hidden-condition enemy omits
   the modifier (no leak).

### PRESERVE / SUPERSEDE map

| Behavior                                                                                                                                                                              | Tag       | CD          |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|-------------|
| R1.1 fresh combatant clean overlay (ailments [], conditions neutral, actions available, durations/counters {})                                                                        | PRESERVE  | CD1         |
| R1.2/R2.1 session scalars carried verbatim, no normalisation                                                                                                                          | PRESERVE  | CD2         |
| R1.5 `toCombatantSetup` inverse (ref half via the out-of-band origin map; zoneId/engagement half reads the same occupancy token CD14 projects)                                        | PRESERVE  | CD3 / CD14  |
| R2.2/R2.3 startCombat no-op-once + reset acted/actor                                                                                                                                  | PRESERVE  | CD5         |
| R3.1–R3.3 per-side highest Agility/Luck + suggestedSide tiebreak                                                                                                                      | PRESERVE  | CD9         |
| R3.4 initiative HP/stat source by ref-kind (three-arm switch)                                                                                                                         | SUPERSEDE | CD9         |
| R4.1–R4.3 draft sets actor / resets consumption / clears Downed / no-op unknown / never blocks                                                                                        | PRESERVE  | CD5         |
| R5.1–R5.3 endTurn marks actual actor / ticks acting participant's durations / no-op null-or-unmatched                                                                                 | PRESERVE  | CD5         |
| R5.2 no-duration-entry axis left untouched even if non-neutral                                                                                                                        | PRESERVE  | CD1         |
| R6.1–R6.4 advanceRound clears all + actor / joiner queued / remove drops+nulls / setSide                                                                                              | PRESERVE  | CD5         |
| R6.3 removeParticipant does NOT sever engagement in the session reducer                                                                                                               | PRESERVE  | CD5         |
| R7.1/R7.3 setCurrentActor unconditional / setRound no-clamp                                                                                                                           | PRESERVE  | CD5         |
| R7.2 setActed acted-boolean → turnsTakenThisRound count (true↔1 / false↔0)                                                                                                            | SUPERSEDE | CD10        |
| R8.1–R8.6 battle conditions extend/flip/clear/tick/auto-expire/no-op-unknown                                                                                                          | PRESERVE  | CD1         |
| R9.1–R9.4 ailments permissive/idempotent/coexist-incl-Downed/order/clear-absent-harmless/uniform                                                                                      | PRESERVE  | CD1         |
| R10.1–R10.4 counters signed-delta-merge/floor-0/delete-at-0/caps-unenforced/uniform                                                                                                   | PRESERVE  | CD1         |
| R11.1 availability-boolean storage → resolved-budget-minus-consumption (available = 1 − used)                                                                                         | SUPERSEDE | CD10        |
| R12.1 enemy vitals absolute-value-set floored-at-0 → signed-depletion delta (stored floor → resolve)                                                                                  | SUPERSEDE | CD6         |
| R12.2 lower-max-drags-current reconciliation eliminated (setMax writes base; current re-derives)                                                                                      | SUPERSEDE | CD6         |
| R12.3 catalog-enemy maxHP default + unknown-key ⇒ max-0; thin key reference at rest                                                                                                   | PRESERVE  | CD3         |
| R12.3 catalog-enemy max resolved at the fold; reducer needs no catalog dep                                                                                                            | SUPERSEDE | CD8         |
| R12.4 vitals no-op for PC/durable + SP-absent + unknown-id — enforced at the `updateVitals` router (never sends durable vitals to the reducer) + capability presence, never kind/flag | PRESERVE  | CD6 / CD18  |
| R13.1/R13.2/FAL-1 Fallen hp<=0 / revive drops / unknown-key ⇒ Fallen — recomputed from resolved vitals                                                                                | SUPERSEDE | CD9         |
| R14.1 endOfTurnReminders heldFlags/activeDurations canonical-order FYI                                                                                                                | PRESERVE  | CD9         |
| R14.2/R14.4 Burn/Sleep/Despair HP tick → a uniform delta intent routed by `updateVitals` (no producer-side null-for-durable); maxHP from resolve                                      | SUPERSEDE | CD9 / CD18  |
| R14.3/R14.5 empty-on-unknown-actor; frenzy reminder (pain before decrement)                                                                                                           | PRESERVE  | CD9         |
| R15/PC-1/PC-2 party composition by Lineage; PC by lineage/ownership capability (not ref.kind==='pc')                                                                                  | SUPERSEDE | CD9         |
| R24.1 reducer purity / Immer same-ref no-op                                                                                                                                           | PRESERVE  | CD4         |
| R24.2 exhaustive switch, no default                                                                                                                                                   | PRESERVE  | CD4         |
| R24.3 newId injected at composition root                                                                                                                                              | PRESERVE  | CD4         |
| R24.4 getEnemy is the reducer's one catalog lookup → reducer needs NO catalog dep                                                                                                     | SUPERSEDE | CD4         |
| R24.5 session reducer reads/writes no spatial field; `mapInstanceId` read only at the `reduceEncounter` root                                                                          | PRESERVE  | CD2 / CD16  |
| RED-1 whitelisted top-level snapshot fields (non-spatial subset)                                                                                                                      | PRESERVE  | CD12        |
| RED-2 overlay public to every viewer; `engagedWith` now a REAL Engagement read (public to all, `[]` when Free/mapless)                                                                | PRESERVE  | CD11 / CD17 |
| RED-3 own/ally PC hp/sp/attributes/affinities/portraitUrl public; presentation row added                                                                                              | PRESERVE  | CD11        |
| RED-4 attributes/affinities structurally ABSENT to opponent + spectator (the only two drop rows, key-drop); kind-keyed → relationship-fold                                            | SUPERSEDE | CD11        |
| RED-5 currentActor → {id,name,side} subset                                                                                                                                            | PRESERVE  | CD12        |
| RED-6/7/8/9 zone/enchantment projection + fog-gating + field-level zoneId→''                                                                                                          | SUPERSEDE | CD12        |
| NAME-1/NAME-3/NAME-4 catalog-enemy name via getEnemy; disambiguated label single-home; identity pass-through                                                                          | PRESERVE  | CD8 / CD12  |
| **— spatial seam (CD13–CD17) —**                                                                                                                                                      |           |             |
| R1.3 co-mint session + instance from one `setup[]` at birth (`participantId === token key`)                                                                                           | PRESERVE  | CD16        |
| R19.5 `zoneEnchantmentEffects` → `ResolveContext.effects` (Toccata); the only engine-modeled combat→spatial read                                                                      | PRESERVE  | CD15        |
| R23.1/R23.2/R23.3 addOccupant / removeOccupant-sever / pruneCombat — spatial-helper obligations the composition calls                                                                 | PRESERVE  | CD16        |
| Position + Engagement Tier-3-only deferral (D28) → instance-lifecycle READ components projected into the bag                                                                          | SUPERSEDE | CD13        |
| merged read-bag `durable ∪ overlay` → `durable ∪ overlay ∪ instance` (3-way disjoint)                                                                                                 | SUPERSEDE | CD14        |
| `engagedWith: []` stub → real Engagement-component read (public to all)                                                                                                               | SUPERSEDE | CD17        |
| **— session write-router (CD18–CD20) —**                                                                                                                                              |           |             |
| `vitalsHome` flag on the pure Participant + in-reducer gate → impure client+server router routes write path + auth by storage home                                                    | SUPERSEDE | CD18        |
| UI never decides the storage path (write-side dual of D7's uniform render)                                                                                                            | PRESERVE  | CD18        |
| vitals routing generalized → one `CombatantComponentWriter` registry over the engine's pure ops (vitals/skillPool/resources/mechanics); engine gains no registry                      | SUPERSEDE | CD19        |
| component-write events leave the generic `CombatEvent` wire → router-only `ComponentWriteEvent` family excluded from `ApplyCombatEventSchema` (structural ephemeral-only)             | SUPERSEDE | CD5 / CD19  |
| archetypes/form-swap excluded — an `applyForm` entity transform, not a component patch (own future path)                                                                              | PRESERVE  | CD19        |
| ~~multi-home cast = atomic `applyCombatantWriteBatch`~~ → a cast is a single caster-side SP/HP write (batch retired, no consumer; R14.4 ticks are independent single writes)          | SUPERSEDE | CD20 → CD21 |
| cast = caster-only SP/HP spend; no target write / no side effect / no session event (v1 `castSkillAction` parity); home-agnostic so an ephemeral boss may cast                        | PRESERVE  | CD21        |
| v1's static, context-free Cast popover → target-aware, viewer-redacted (`visibleEntity`) display-only preview; structured riders stubbed                                              | SUPERSEDE | CD22 / CD23 |

---

## 5. Deferred scope

Recorded so a reader knows these are _intentionally_ unaddressed, not forgotten.

- **The spatial seam is pulled forward (§2.10, CD13–CD17)** — NOT deferred: Position +
  Engagement as instance-lifecycle READ components, the zone-enchantment read into resolve,
  the `engagedWith` un-stub, and the `reduceEncounter` composition contract. Combat is
  designed *over* spatial, one-way.
- **Tier 3 — the Map-Instance spatial INTERNALS** (parent D28) **stay deferred** to their own
  future ADR: zone geometry + `reduceMapGeometry`, fog/reveal, connection locks, the
  movement/engagement **transition** events (`moveCombatant`, set/clear-engagement) + the
  engagement-graph **write** primitives, apply/clear enchantment, the map editor, the dungeon
  exploration loop (`reduceDungeon`), and field-level (`zoneId→""`) + fog-gated redaction.
  Ranges + opportunity-attacks stay **DM-adjudicated** (no `validTargets`, no auto reactions).
  The spatial projector **composes over** §2.6's envelope; the combat-SESSION reducer still
  reads/writes no spatial field (R24.5 — `mapInstanceId`'s only reader is the `reduceEncounter`
  root, CD16).
- **Deferred turn rules** (parent D21): Follow-Ups / Shift / All-Out / Synthesis / Boss
  multi-turn. The substrate is wired (`turnsTakenThisRound` + a `turnsPerRound = 1`
  constant); the rules are a clean seam off it. **Boss multi-turn** (`turnsPerRound` = party
  size) and **zone-enchantment action grants** are the two deferred producers that will turn
  the constant 1/1/1 budget into a real resolve-fold — flagged so the constant is understood
  as intentional, not an oversight.

### Open items (honest — outside the engine layer's authority)

1. **Durable-NPC entity table** is designed-but-unbuilt (CD7). Until the NPC PR, durable
   combatants = PCs only (on the existing character row); the NPC-row + per-field-action path
   is a specified seam. Confirm with the user whether the entity table lands in the encounter
   PR or a follow-on.
2. **Session storage shape** — does the v2 Session get its own table, or is the session blob
   a column on an existing encounter row? D29 says "container, not an entity" but does not pin
   the table; an `apps/web` persistence-shape call.
3. **Free-entered inline enemies** — do they author an SP pool (v1's inline `EnemyStatBlock`
   carried maxSP/currentSP) or default to no `skillPool` for catalog parity? CD7 makes either
   work structurally; a product/UX call for the free-entry form.
4. **Composition residency (CD16, the one Leaning decision)** — ship a literal pure
   `reduceEncounter` wrapper (recommended — compiler-enforced routing, pure cross-write
   atomicity tests) vs a documented shell pattern; and whether combat-end is a pure
   `endCombat` arm vs shell-composed (decision-log Q6/Q7).
5. **Single-zoneId combat-facing contract + the structural guard (CD13/CD15)** — confirm with
   the spatial-ADR author that one zoneId per participant at the enchantment read is an
   acceptable permanent contract, and add a depcheck import-direction rule (spatial may not
   import `combat`/`encounter`) when the spatial folder lands (decision-log Q8/Q11).
