# Engine v2 — Combat / Encounter Decision Log

A running log for the combat / encounter subsystem of the `@workspace/game-v2`
redesign. It is the chronological rationale companion to the
[ADR](./ADR.md) in this folder. Status tags mirror the parent log:
**Settled**, **Leaning**, **Open**. CD1–CD15, CD17, CD18, CD19 are **Settled**;
**CD16 + CD20 are Leaning** (CD16: the composition wrapper's residency + endCombat's home,
Open Qs 6–7; CD20: the multi-home batch's producer seam + day-one need, Open Qs 12–13).
**CD18** supersedes the `vitalsHome` mechanism of CD6; **CD19** generalizes CD18's vitals
router into the registry-driven session write-router (CD18 becomes its `vitals` writer).

## Context — combat subsystem

This log records the decisions (CD1–CD12) that design the
**non-spatial** core of game-v2's encounter tracker — vitals over the encounter,
the turn loop, the snapshot redaction surface — plus the **spatial-seam
revision** (CD13–CD17) that designs combat *over a spatial seam* rather than
spatial-blind. The kernel, resolve fold, mechanics registry, items, skills, and
combat resolvers already exist; `encounter/` and `visibility/` were empty
scaffolds before this work.

**The spatial-seam revision (CD13–CD17).** The first pass scoped ALL Map-Instance
state to a future spatial ADR and left only an inert `mapInstanceId` stub + a
hardcoded `engagedWith: []` redaction stub. CD13–CD17 pull the narrow READ SEAM
forward — knowing spatial exists — while keeping the heavy spatial internals
deferred. Concretely: Position + Engagement become real **instance-lifecycle**
capability components (a THIRD lifecycle beside durable/overlay) projected into the
merged read-bag (CD13/CD14); the one engine-modeled combat→spatial read (zone
enchantment → resolve effects) is wired (CD15); the `reduceEncounter` composition
+ changed-rows `guardMany` seam is designed (CD16); and `engagedWith` un-stubs into
a real Engagement read (CD17). The WRITE/author/derive side (geometry, fog, the
movement/engagement transitions, the exploration loop) stays deferred. The
dependency is **one-way**: combat reads spatial; spatial stands alone in
exploration.

Everything here builds on the parent
[`../decision-log.md`](../decision-log.md) (D1–D45). The recurring north star is
**D1** (capability/component entities, zero `kind` branches) and the
[`_principles-review.md`](../_principles-review.md) **F1** meta-lesson: a design
can be complete AND sound AND still betray its thesis. F1 was the
`CombatantRef`/`ResolvedStatblock` ghost reappearing at the Session's center, and
killing it at every site is the through-line of CD1–CD12.

The CD numbering here is the authoritative ledger ordering; the
[ADR's](./ADR.md) cross-references resolve against these numbers.

### Locked scope (decided with the user; not relitigated here)

- **Resolution = v1-parity tracker.** The engine TRACKS DM-adjudicated overlay
  state and computes almost no combat math. It keeps only v1's existing light
  assists: end-of-turn Burn (−10% maxHP) / Sleep (+10% maxHP) HP ticks,
  saving-throw + side-effect reminders, the frenzy reminder. NO new
  auto-resolution. PR7 attack-roll / damage-bonus resolvers stay DISPLAY-ONLY
  producers (`pendingEffects`), never on the wire.
- **Visibility = in scope.** The non-spatial `(component × relationship)`
  redaction table + `visibleEntity` + snapshot-envelope projector. Field-level
  (`zoneId → ""`) redaction and fog-gating DEFER to the future spatial ADR.
- **Turn rules = substrate now, rules later.** Model `turnsTakenThisRound` +
  resolved turn/action budget (D21); DEFER Follow-Ups / Shift / All-Out /
  Synthesis / Boss multi-turn behind a clean seam.
- **Spatial SEAM = in scope (the CD13–CD17 revision).** Position + Engagement as
  instance-lifecycle components projected into the read-bag; the zone-enchantment
  READ into resolve; the `engagedWith` un-stub; the `reduceEncounter` composition
  contract. These are the READ side of the seam.
- **Spatial INTERNALS → future spatial ADR (still deferred).** Zone geometry +
  `reduceMapGeometry`, fog / reveal, connection locks, the movement / engagement
  TRANSITION events (`moveCombatant` / set+clear-engagement) and the
  engagement-graph WRITE primitives, apply/clear enchantment transitions, the map
  editor, the dungeon exploration turn loop (`reduceDungeon`), field-level
  (`zoneId → ""`) + fog-gated redaction. **Parity guards (do NOT cross):** ranges +
  opportunity-attacks stay DM-adjudicated (no engine `validTargets`, no auto
  reactions); movement / engagement TRANSITION events stay in the spatial reducer
  (combat reducer stays non-spatial, R24.5); the action budget stays constant
  (Tarantella's grant is prose-deferred).

The preserve/supersede tags below cite the acceptance spec
[`../requirements/03-encounter-tracker.md`](../requirements/03-encounter-tracker.md)
(R1–R24) and
[`../requirements/04-views-redaction-dungeon.md`](../requirements/04-views-redaction-dungeon.md)
(RED-* / DRD-*).

---

## Decisions

### CD1 — Overlay state lives as encounter-overlay components; reject the `Participant.overlay` struct · **Settled**

_Builds on D29, D11, D21, F1._

**Decision.** The six encounter-overlay states — `Allegiance`, `TurnState`,
`Ailments`, `BattleConditions`, `ConditionDurations`, `Counters` — are real
components, narrowable with the same guard machinery, **not** a fused god-struct.
They are tagged encounter-overlay (cleared at combat end) and live in a sibling
`OverlayRegistry` rooted in `encounter/`, NOT in the kernel `ComponentRegistry`
(which is the durable entity-row vocabulary).

The accepted **revision** (from the F4 SIMPLICITY critic): because overlay
components are ALWAYS present per participant with defaults (R1.1), they are NOT
loaded from a sparse jsonb bag. Model `Participant.overlay` as a plain typed
struct of six named always-present fields, each its own Zod schema, read via
`participant.overlay.X` (no presence-guard, since none can be absent). The
`OverlayRegistry` is a **type grouping** (the shared-lifecycle bundle the
principles review cleared as SOUND), not a runtime `Partial<>` requiring guards.
Redaction, the reducer, and selectors operate over one uniform surface
(`entity.components` for durable + `participant.overlay` for encounter-scoped);
resolve never reads overlay keys under parity. The end-of-combat sweep drops the
entire overlay struct (total by construction — one named object, not a hand-list).

**AMENDED (CD13/CD14, spatial-seam revision).** The merged read-bag the visibility
projector folds extends from `durable ∪ overlay` to **`durable ∪ overlay ∪ INSTANCE`**. Composition is named explicitly: **RESOLVED durable read-units ∪ RAW
overlay components ∪ RAW instance components** (Position / Engagement) — three
sources, overlay and instance carried RAW (no resolve pass, exactly as overlay
already is), NOT a single `ResolvedEntity`. The one uniform redaction fold now also
folds the projected Position + Engagement read-units (zero new branch). **One
pass-through mechanism:** identity, position, and engagement are ALL loader-injected
into the read-bag AFTER resolve runs — none rides `ResolvedComponentRegistry`
pre-resolve as a derived unit (identity's pass-through entry is reconciled onto the
same post-resolve injection path), so a reviewer never asks "why isn't identity
instance-injected too." The build-time disjointness assertion extends from 2-way
(`OVERLAY_KEYS ∩ keyof ComponentRegistry = ∅`) to **3-way** (+ a typed
`INSTANCE_KEYS` const, `satisfies`-total, disjoint from BOTH). Position / Engagement
live in a sibling **`InstanceRegistry`** rooted in `encounter/`, mirroring this CD's
own `OverlayRegistry` choice, NOT in the kernel `ComponentRegistry` (CD13).

**Rationale.** A parallel `overlay` *struct* sitting beside `entity.components`
at the Session's center is the exact F1 trap. Modeling overlay as components keeps
guard / resolve / redaction uniform; modeling it as one always-present struct
keeps the sweep total without any runtime lifecycle index. Both halves matter:
"components, not a struct" is the thesis fidelity; "one always-present struct, not
a sparse `Partial<>`" is the simplicity correction.

**Alternatives rejected.** (a) The literal ADR §2.6 `Participant.overlay`
*god-struct* — betrays the thesis (a second state-bag the reducer/redaction must
know about). (b) One coarse `overlay` component wrapping all six — a god-component
that defeats narrow reads (D30/F3 granularity). (c) Overlay components folded by
resolve as a layer — out of locked scope (no auto-resolution under parity).

**Adversarial critique resolution.** Thesis / parity / simplicity critics all
upheld the headline (overlay-as-components, reject the struct). Two simplicity hits
were folded in: (1) the catalog-lifecycle-tag machinery the original draft leaned
on does NOT exist in game-v2 (verified: `component-registry.ts` carries no
lifecycle metadata) — so the sweep is NOT a runtime lifecycle index but the fact
that the overlay is one plain struct (drop it wholesale) plus a typed
OVERLAY/durable disjointness check where keys could collide (see CD3); (2) overlay
fields are never absent, so `makeGuard` reuse is a no-op — use the plain struct
ADR §2.6 already specifies. The `engagedWith` stub question raised here is resolved
in CD11/CD12.

_PRESERVE:_ R1.1 (fresh overlay defaults), R8 (battle conditions), R9 (ailments
`string[]`), R10 (counters). _Lifecycle:_ R23.3 sweep keys on the overlay struct,
never kind (see CD7).

---

### CD2 — `Session = scalars + Participant[]`; `Participant = { id; entity; overlay }`; no kind on the runtime Session · **Settled**

_Builds on D29, D21, F1._

**Decision.** `Session = { round; currentActorId; advantage; firstSide;
participants: Participant[] }` with an inert reserved `mapInstanceId?: string`
(Tier-3 seam, combat reducer touches it never, R24.5). The four scalars carry
from v1 verbatim — no normalization (R2.1). `Participant = { id; entity: Entity;
overlay: Overlay }`. The wrapper is RETAINED (not collapsed to `Entity[]`) for two
load-bearing reasons: (a) it homes the encounter-scoped overlay struct, which must
NOT fuse into `entity.components` (that would mis-file overlay as durable and leak
transient ailments/turnState across encounters via the entity row); (b) the
participant `id` is the roster/combatant key, intentionally distinct from
`entity.id` (a durable entity could in principle appear twice; the combatant
identity is what overlay/turn-order key on). The runtime Participant carries NO
storage kind/ref — the loader (CD3) has already dissolved
durable-vs-inline-vs-catalog into a uniform `entity`.

**Rationale.** The session scalars are the clean part of v1 (no kind, no spatial
field) and survive untouched; the razor is only ever threatened by the
*participant* shape. Keeping `mapInstanceId` inert honors D28 while leaving a
clean Tier-3 seam rather than forcing a later session-shape migration.

**Alternatives rejected.** (a) Make the encounter itself an Entity — D29 settled
the Session is a *container*, not a resolvable entity. (b) Collapse `Participant`
to bare `Entity` (and either fuse overlay into components, or hold a parallel
`Map<id, Overlay>`) — the first mis-files lifecycle, the second splits one
participant's state across two structures keyed by the same id (drift bait).

**Adversarial critique resolution.** The F1-fork critic argued `Participant =
{ entity }` could collapse to `Entity[]` since R24.5 homes spatial tokens on the
map instance. RESOLVED in favor of keeping the wrapper: the overlay (CD1) must sit
beside `entity` (not inside components) AND the combatant `id ≠ entity.id` — those
two facts give the wrapper a real job *today*, independent of the Tier-3 seam, so
it is not vestigial. This supersedes the literal ADR §2.6 `{ entity; overlay }`
shape only by adding the explicit combatant `id` field (the roster key v1 carried
on `Combatant.id`).

**AMENDED (CD16, spatial-seam revision).** `mapInstanceId` is no longer FULLY
inert. The combat-SESSION reducer STILL never reads it (R24.5 PRESERVED), but the
`reduceEncounter` wrapper ABOVE the session reducer (CD16) uses it to load the
paired instance row for the merged-bag projection (CD14) and the composition seam.
The Session shape is unchanged; the field gains a real reader at the composition
root, not in the pure session reducer.

_PRESERVE:_ R1.2 / R2.1 (scalars verbatim, id minting per R24.3), R24.5
(`mapInstanceId` inert in the session reducer; reader added at the
`reduceEncounter` root only, CD16).

---

### CD3 — The persisted storage locator + the ONE loader boundary that dissolves it into a uniform Entity (kills the F1 `CombatantRef` ghost) · **Settled**

_Builds on D11, D12, D13, D29, F1._

**Decision.** The storage locator is a discriminated union that exists ONLY in the
persisted session blob and is consumed at exactly TWO impure-shell boundaries (the
`loadParticipant` read and the saver write-back) — never in engine logic, resolve,
guard, redaction, or the reducer. The settled 2-arm shape:

```ts
type StoredEntityLocator =
  | { storage: 'durable'; entityId: string }
  | { storage: 'inline';  entity: StoredEntity }
```

A **catalog enemy** is expressed as an INLINE entity whose components carry a small
dedicated `catalogRef` component (NOT overloading identity), resolved by the
resolve fold via a `getEnemy` port (CD8) — mirroring how `archetypes.active`
resolves via `getArchetype` — NOT a third storage arm. To keep the roster
uniformly Entity-shaped, a catalog enemy is pre-expanded at session construction
into an inline entity bag carrying `catalogRef` plus inline `vitals { base: <from
catalog>, damage }`.

```ts
loadParticipant(sp, loadById): Participant
//   durable → loadById(entityId)
//   inline  → loadEntity(components)
```

The boundary statement: NOTHING downstream names `StoredEntityLocator`; everything
takes a `Participant` with `entity` already attached and never reads a storage tag.
Catalog/durable dedup (O18/D29) is preserved by memoizing `getEnemy(key)` in the
resolve deps and memoizing `entityId` fetches in the loader. Build-time
disjointness: the `OVERLAY_KEYS` set (CD1 sweep) and the durable
`ComponentRegistry` keys must be provably disjoint (a typed `satisfies` check), so
the loader merge and the sweep can never shadow each other.

**Rationale.** This is the honest F1 defense the original ADR "never makes": the
union is a *storage-locality* distinction (is the durable state on a row or in the
blob?), a lifecycle fact, not a domain-modeling fact — the dual of
`StatProfile.source` / `archetypes.active`, both cleared as SOUND. Two arms keyed on
the irreducible storage fact is strictly closer to the thesis than three, and the
catalog distinction genuinely IS a component-level concern resolved by the existing
fold.

**Alternatives rejected.** (a) Three-arm locator with catalog resolution in the
loader — behaviorally equivalent but one extra storage arm and a bespoke
catalog→components projection that duplicates resolve's archetype-key fold. (b)
Two arms but copy the catalog blob inline at setup — forks identity from the
catalog and breaks the thin-pointer invariant (R12.3). (c) Mint a durable row per
catalog enemy — defeats the ephemeral-enemy lifecycle (an AoE on N mooks = N rows).

**Adversarial critique resolution.** Multiple critics: (1) the saver reads the
locator on the WRITE path too — ACCEPTED and named: the locator is read at exactly
two shell boundaries (load + save), both impure, neither in engine logic. (2) The
lifecycle-tag machinery does not exist — ACCEPTED: replace it with a typed
`OVERLAY_KEYS` const (`satisfies readonly (keyof OverlayRegistry)[]`) plus a
build-time disjointness assertion, NOT a runtime lifecycle index (proportionate
footprint). (3) Write-back origin — RATIFIED the out-of-band map: the impure shell
tracks each participant's origin in a parallel
`Map<participantId, StoredEntityLocator>` NEVER on the pure Session; a write-back
token ON the runtime Participant is FORBIDDEN (one convention-lapse from re-leaking
F1). (4) 2-arm vs 3-arm — SETTLED on 2-arm (catalog-as-component), the tightest F1
kill. (5) When `catalogRef` is resolved by the fold it is a BASE-SUPPLYING read (an
enemy's base IS the catalog value), not an archetype-style LAYER-over-base — stated
explicitly so the asymmetry with `archetypes.active` is not glossed.

**AMENDED (CD14, spatial-seam revision).** The one loader boundary is REFRAMED from
"dissolves a 2-arm storage locator into `Participant.entity`" to "**assembles the
merged read-bag from its THREE physical homes** (durable row, session blob, instance
token)." Downstream still names no storage home or token — the F1 kill is preserved
(the bag stays a uniform key→component surface; no third storage DISCRIMINANT is
added downstream). The out-of-band origin map gains an instance-token-id dimension
for the participant→token mapping (impure shell only, never on the pure
`Participant`). The loader now hosts TWO orthogonal projections — storage
dissolution (this CD) and enchantment-effects assembly (CD15) — as independent passes
over the same participant. The 3-way disjointness assertion (CD1 amendment)
supersedes the 2-way one stated here.

**AMENDED (CD19).** The explicit `storage: 'durable' | 'inline'` discriminant is **redundant** — the
2-arm union's SHAPE already carries it: `{ entityId }` (durable, a reference) vs `{ entity }` (inline,
ephemeral). So the storage home is **derived** (`isInline(p)`), never a stored tag — the same lesson as
CD18's `vitalsHome` removal, one level down. The irreducible datum is the `entityId` *reference* itself
(the durable arm needs to know which row); its presence/absence IS the home signal. The write-router's
`storeFor` (CD19) selects the storage `Store` by this derivation; nothing stores a `home`/`storage` field.

_SUPERSEDE:_ v1's `CombatantRef` closed `{pc|enemy|catalog-enemy}` union → 2-arm
storage locator dissolved at one loader boundary; catalog enemy = inline entity +
`catalogRef`; (CD19) the explicit `storage` discriminant → the derived union shape (no home tag).
_PRESERVE:_ R1.5 (`toCombatantSetup` inverse via the out-of-band map —
spatial half reads the same instance token CD14 projects, CD16), R12.3 (thin catalog
reference at rest).

---

### CD4 — The pure reducer: `createReduceSession(newId)(session, event) → session` — exhaustive switch, Immer same-ref no-op, no kind branch · **Settled**

_Builds on D29, D21, D9, D10, D26, F1._

**Decision.** `createReduceSession(newId)(session, event): Session` — curried,
pure, Immer `produce` over the whole Session (same-ref no-op for every untouched
path, R24.1), one grouped exhaustive `switch` over `event.kind` with NO `default`
(R24.2). The reducer reads/writes the overlay struct (ailment/condition/counter/
turn/economy events) and `participant.entity.components.{vitals,skillPool}` for the
lifecycle-gated vitals event; it reads/writes NO spatial field (R24.5). **`deps`:
`getEnemy` is DROPPED from the reducer** (see CD8 — under signed depletion the
reducer never re-resolves a catalog max; the loader seeds inline-enemy
`vitals.base`). The reducer therefore needs NO catalog dep, SUPERSEDING R24.4's
"`getEnemy` is the one reducer lookup". `newId` is injected at the composition root
(R24.3), used only for the `addParticipant` id fallback. NO `ref.kind` reaches the
reducer (the loader dissolved storage at CD3).

**Rationale.** Curried + injected `newId` + exhaustive-no-default switch is the
settled v1 pattern and the v2 composition-root convention; a new kind fails to
compile until both routed and sliced. Immer whole-Session produce reproduces v1's
same-ref no-op contract verbatim. The key simplification: v1 used `getEnemy` ONLY
for the catalog max-HP clamp in `adjustEnemyVitals`, which is gone under signed
depletion.

**Alternatives rejected.** (a) Keep `getEnemy` on the reducer "for the seam" — a
vestigial dep on spec; re-add it only if a later loader proves lazy/unseeded. (b)
Let the reducer read `ref.kind` — the F1 betrays-thesis violation. (c) Split into
session + map-instance reducers now — spatial is Tier 3 (D28).

**Adversarial critique resolution.** Simplicity + thesis critics unanimous: the
kept `getEnemy` dep is vestigial under signed depletion (the catalog max-HP clamp
disappears when the loader seeds `vitals.base` and `currentHP` re-derives at
resolve). RESOLVED as a hard decision (not an open question): drop `getEnemy`,
SUPERSEDE R24.4 to "the session reducer needs no catalog dep." The vitals no-op
gate (CD6) does NOT need `getEnemy`.

**REAFFIRMED (CD15/CD16, spatial-seam revision).** The combat-session reducer still
reads/writes NO spatial field. Position / Engagement enter via the LOADER projection
(read-only, CD14); the zone-enchantment read enters via the loader's
`ResolveContext.effects` injection (CD15) — never through a reducer event. The new
`reduceEncounter` wrapper (CD16) sits ABOVE `createReduceSession` and does NOT add a
dep to it (`deps` stays just `newId`).

_PRESERVE:_ R24.1 (purity/same-ref), R24.2 (exhaustive switch), R24.3 (`newId` at
root). _SUPERSEDE:_ R24.4 (`getEnemy` is the one reducer lookup → no catalog dep).

---

### CD5 — The full v2 `CombatEvent` union + slice map — 1:1 port of the eight non-vitals families · **Settled**

_Builds on D29, D21, F1._

**Decision.** Port v1's per-concern families 1:1 (same kinds, same payloads, same
no-op contracts), retargeted from `Combatant`/`CombatSession` onto
`participant.overlay`/`Session`, with honest renames (`addCombatant →
addParticipant`, `removeCombatant → removeParticipant`, `combatantId →
participantId`; `setSide` writes `overlay.allegiance`). Slices live in
`encounter/reduce/`, one per concern, the switch fanning multi-kind arms to a
shared slice:

- `startCombat` → `reduceStartCombat` (R2)
- `draftCombatant` → `reduceDraft` (R4)
- `endTurn` → `reduceTurn` (R5)
- `advanceRound | addParticipant | removeParticipant | setSide` → `reduceRoster`
  (R6, takes `newId`)
- `setCurrentActor | setActed | setRound` → `reduceOverride` (R7)
- `adjustBattleConditionAxis | setBattleConditionFlag` → `reduceBattleCondition`
  (R8)
- `setAilment | clearAilment` → `reduceAilment` (R9)
- `adjustCounter | clearCounter` → `reduceCounter` (R10)
- `setActionEconomy` → `reduceActionEconomy` (R11)
- `damageParticipant | healParticipant | setParticipantMax` → `reduceVitals` (R12,
  see CD6)

Every slice preserves its v1 no-op-same-ref behavior verbatim (unknown id,
startCombat-once-set, endTurn-null-actor, counter-delete-at-0, same-direction-
extend-vs-flip-reset keyed on the AXIS STATE not the duration entry, end-of-turn
duration tick). `removeParticipant` drops the participant + nulls `currentActorId`
ONLY; the symmetric engagement sever is a Tier-3 occupancy-prune obligation (R6.3
spatial half deferred, D28) — the cutover shell must not silently assume it happens
here.

**Rationale.** The locked scope is v1-parity tracking, so every non-vitals family
is a mechanical retarget, not a redesign. Identical kinds/payloads minimize the
golden-master surface. The renames are honesty (the v2 runtime unit is
`Participant`; allegiance is encounter-scoped overlay), not churn.

**Alternatives rejected.** (a) Collapse granular events into one `patchOverlay` —
violates the locked scope and the granularity that is load-bearing for correctness
(delta counters merge server-side; per-field battle-condition writes are the
UNN-226 cautionary tale). (b) Keep v1 names — would re-imply a `Combatant` struct
distinct from the entity, the nominal residue v2 sheds. (c) Route vitals through
the overlay slice — vitals target `entity.components` and are lifecycle-gated, a
different write target and no-op rule.

**Adversarial critique resolution.** Parity critic: (a) the R8 extend-vs-flip
discriminator must read `battleConditions[axis] === target` (the STATE), not
`conditionDurations[axis]` presence, now that durations are a sibling component —
PINNED. (b) `draft`'s Downed-clear must use array-filter (`ailments.filter(a => a
!== 'downed')`), not a typed key-drop, preserving the `string[]` contract — PINNED.
(c) `removeParticipant` engagement-sever correctly deferred to Tier 3 — confirmed
clean seam.

**AMENDED (CD19).** The vitals events (`damageParticipant`/`healParticipant`/`setParticipantMax`)
**leave this generic `CombatEvent` union** and become the first members of a **router-only
`ComponentWriteEvent` family** excluded from `ApplyCombatEventSchema`'s accepted input (the
wire-schema split that makes structural-ephemeral-only real, CD19). `reduceVitals` stays a slice
but is reached only via a router-constructed event; the eight non-vitals families here are
unchanged. So this union is the **overlay/turn/roster wire** (DM-only console); component-writes
are a separate router-only path.

_PRESERVE:_ R2, R4, R5, R6, R7, R8, R9, R10, R11 (event shape), R24.1/R24.2. _SUPERSEDE (CD19):_
vitals' membership in the generic wire union → the router-only `ComponentWriteEvent` family.

---

### CD6 — VITALS restructure: signed-depletion delta events, lifecycle-gated no-op via `vitalsHome`, never kind · **Settled**

_Builds on D9, D10, D26, D29, D37, F1._

**Decision.** Replace v1's absolute `adjustEnemyVitals` with delta-shaped
signed-depletion events: `damageParticipant | healParticipant | setParticipantMax`,
each over pool `'hp' | 'sp'`. `reduceVitals`:

1. Find participant; missing → same-ref.
2. **LIFECYCLE GATE:** if `participant.vitalsHome !== 'inline'` → same-ref
   (subsumes v1's PC no-op AND extends it to durable NPCs; vitals on a row are
   written by the separate entity action, CD7). `vitalsHome` is a two-valued
   storage-LIFECYCLE locator (does this participant's authoritative vitals live in
   the session blob or on a durable row), the loader sets it as the inverse of the
   arm it dissolved (`durable → 'durable'`, `inline → 'inline'`), read at exactly
   ONE site. It is NOT kind — it is the F1-sanctioned load-time locator (materially
   the entity.kind COLUMN / `StatProfile.source` the principles review cleared);
   the ADR MUST argue this explicitly.
3. Pool select: `hp → vitals`, `sp → skillPool`; if the component is `undefined` →
   same-ref (a no-SP catalog enemy no-ops an `sp` event via capability absence —
   reproducing R12.4 with no kind check).
4. Apply via the existing total operations: `damageParticipant → applyDamage`
   (signed, unclamped, over-max loan licensed, D10); `healParticipant → applyHeal`
   (floors damage at 0, no-ops when already negative to preserve over-max);
   `setParticipantMax → write component.base` (authored intrinsic; effective max is
   RESOLVED, `currentHP = max(0, maxHP − damage)` re-derives, NO current-drags-max
   reconciliation).

NO floor on stored `damage`/`spSpent`; the floor lives in resolve + each
operation's clamp.

**Rationale.** Absolute-value setters are incoherent with a stored-depletion field
(you'd back-compute `damage = maxHP − value`, needing resolved maxHP inside the
reducer). Delta events map directly onto the depletion fields and the already-built
operations. The over-max loan, the eliminated lower-max reconciliation, and the
catalog-fallback clamp all fall out for free. The no-op gate must be
lifecycle/capability, never kind — `vitalsHome` + capability presence jointly
reproduce R12.4's three no-op arms (PC, SP-on-catalog-enemy, unknown-id) with ZERO
kind branch.

**Alternatives rejected.** (a) Keep a single absolute `adjustVitals` — drags the
resolve fold into the reducer and re-introduces the R12.2 reconciliation D9
eliminates. (b) One signed `adjustVitals { pool; delta }` — damage and heal have
different clamps and `setMax` writes a different field; collapsing them re-encodes
the operation choice in the payload. (c) Gate the no-op on `guard('vitals')` alone
— insufficient: a durable participant's entity DOES carry a resolved `vitals`
component (so currentHP renders), so the guard is true for BOTH arms; the
distinction needed is storage-lifecycle. (d) Floor stored `damage` at 0 — breaks
the over-max loan and overkill provenance.

**Adversarial critique resolution.** Thesis critic: `vitalsHome` is the one spot
the F1 ghost could re-enter; soundness depends on the ADR MAKING the storage-locator
argument (not just stating the shape). ACCEPTED as a hard ADR-writing obligation.
Loader contract PINNED (cross-ref CD3/CD7): the loader attaches the `vitals`
component to durable participants too (so currentHP renders in the DM console) AND
sets `vitalsHome = 'durable'` — a contract test asserts both, so the
lifecycle-vs-capability gate stays load-bearing.

**AMENDED (CD18).** The `vitalsHome` field + the in-reducer lifecycle gate are **removed**.
The durable-vs-ephemeral routing they encoded moves UP to an impure `updateVitals`
application-service (CD18) that reads the storage home from the locator map and dispatches
the right write path; the reducer's vitals events become **ephemeral-only by construction**,
so the reducer applies over the inline authored `vitals` unconditionally (a
capability-presence no-op is the only residual, never a storage flag). Everything else in
this CD — the signed-depletion operations, the clamps, `setParticipantMax` writing `base` —
stands. (The "the ADR MUST argue `vitalsHome` is not the F1 ghost" obligation is moot: the
flag is gone.)

_SUPERSEDE:_ R12.1 (absolute → signed delta; stored floor moves to resolve), R12.2
(current-drags-max eliminated; `setParticipantMax` writes base), R12.3
(catalog-fallback leaves the reducer; loader seeds inline base). _PRESERVE:_ R12.4
(PC / SP-absent / unknown-id no-ops) — now via the `updateVitals` router (never sends a
durable vitals write to the reducer) + capability presence, never kind or a `vitalsHome`
flag (CD18).

---

### CD7 — Persistence: ephemeral overlay/vitals → session blob (single version, guarded); durable vitals → entity row via per-field action; 1+N → `guardMany` · **Settled**

_Builds on D11, D12, D13, D27, D29._

**Decision.** Lifecycle is the storage axis (D11–D13, D29), generalizing v1's
existing PC/enemy split.

- **(a)** Encounter-overlay state (the six overlay fields) + an EPHEMERAL
  combatant's `vitals.damage` live inline in the session blob, one
  `bumpEncounterVersionGuarded` single version (DM is sole writer, D12); the
  reducer is pure, the action layer does `reduce → saveEncounterSession(id, next,
  expectedVersion)`.
- **(b)** DURABLE combatant vitals (PC + reusable NPC) live in the entity row's
  `components` jsonb, written by a SEPARATE per-field entity Server Action
  (owner-mode read-row → merge → write), bumping the entity's version, NEVER
  `encounter.version`; the combat reducer never writes an entity row. PC vitals
  stay on their own adjust-pools-equivalent path (the corrected premise: PC vitals
  were never a combat event).
- **(c)** The only >1-row event (an AoE on multiple DURABLE combatants) uses the
  existing `guardMany` over the affected entity rows; single-durable and
  all-ephemeral writes stay single-row/single-version.

**SCOPE NOTE.** The v2 entity table is sequenced LAST (D23/ADR §4); for the
encounter PR, durable = **PCs ONLY** (which already have their row + version + ping
in v1). The reusable-NPC entity-row path and the entity-version dimension of the
composite snapshot version are a NAMED-BUT-UNBUILT seam gated on the entity table —
do not build the 1+N `guardMany` / 3-part composite version speculatively.
End-of-combat cleanup clears ONLY the overlay struct + ephemeral enemy vitals;
durable vitals (and exhaustion, D27) survive — the sweep keys on the overlay struct
/ lifecycle, never kind.

**Rationale.** This is D29 applied verbatim and the corrected premise: v1 ALREADY
splits PC vitals (character row, separate action, `vitalsVersion`) from enemy
vitals (session blob). v2 generalizes "PC" → "any durable combatant" and "enemy" →
"any ephemeral combatant." The single-version collapse (D12) holds because the
contended combat churn lives on the session blob.

**Alternatives rejected.** (a) Move ALL vitals onto durable rows — every
multi-target moment becomes 1+N rows in a transaction; D29 keeps ephemeral vitals
inline. (b) Per-component version tokens inside the jsonb — D12 collapsed to one
token once churn moved to the session.

**Adversarial critique resolution.** Simplicity critic: the durable-NPC
entity-row path + per-entity realtime channel + 3-part composite version target an
entity table that does not exist and ships last (verified: no persistence code in
game-v2, no v2 entity table in schema). DEMOTED from co-equal to an explicit
"PCs-only now; NPC-row + entity-version dimension is a named-but-unbuilt seam." This
keeps the encounter PR's actual write surface small (reuses v1's PC row/version/ping
verbatim).

**AMENDED (CD13/CD16, spatial-seam revision).** Lifecycle gains a THIRD axis value —
**`instance`** (delve-scoped) — alongside `durable` and `overlay`. Instance state has
its own version token (the existing `mapInstances.version`), is shared with
exploration, and **SURVIVES the end-of-combat `OVERLAY_KEYS` sweep**. The sweep's
totality claim is now paired with the explicit fact that instance keys are provably
disjoint from `OVERLAY_KEYS` (3-way disjointness, CD1 amendment), so the sweep
structurally CANNOT touch Position / Engagement — survivors keep zoneIds BECAUSE
position is instance-tagged, not by vigilance. **Combat-end becomes a COMPOSED
action** (CD16): the overlay sweep (combat-owned) + a spatial `pruneCombat` (drops
enemy tokens, frees survivor engagement, clears enchantment, KEEPS survivor zoneIds —
a SPATIAL write, NOT the `OVERLAY_KEYS` drop) + the status-column flip, atomic over
both version tokens. Cross-writes spanning both rows use `guardMany` over two tokens,
driven by a same-ref changed-rows diff. The 1+N durable-NPC seam stays
named-but-unbuilt and co-resident with the instance token in the same `guardMany`
when it lands.

_PRESERVE:_ v1 PC/enemy vitals storage split → durable/ephemeral lifecycle split
(NPC-row path named-but-unbuilt); R23.3 sweep clears ephemeral overlay + enemy
vitals, keeps durable (exhaustion D27) AND keeps instance-tagged positions (CD13).

---

### CD8 — `getEnemy` port returns an authored Entity; a catalog enemy carries NO `skillPool` (SP is capability-by-presence) · **Settled**

_Builds on D29, D32, D37, D39, D1, F1._

**Decision.** Add ONE method to `kernel/ports.ts` `GameData`: `getEnemy(key:
string): Entity | undefined` — returns a fully-formed authored Entity (component
bag), NOT an `EnemyDefinition` struct (a second nominal type would recreate the F1
ghost; an Entity means a catalog enemy and a durable NPC are the same shape at the
point of use, and resolve runs one uniform fold over both). Authored → D37-base
mapping: `identity { name }`, `attributes { base }`, `affinities { base: <sparse
chart> }`, `vitals { base: maxHP, damage: 0 }`, `level { value }`; `mechanics` only
if the enemy authors one; NO path/archetypes/manualBonuses/equipment/resources/
exhaustion.

A shipped catalog enemy carries **NO `skillPool` component** — so resolve emits no
skillPool read-unit, the snapshot's enemy `sp: null` is a STRUCTURAL consequence of
component absence (RED-4/ROS-5, not a special case), and an SP write against it
no-ops via capability absence (CD6). Never author `skillPool: { base: 0 }` (a
present-but-empty pool resolves AS a casting combatant). The catalog is the
resolve-fold's BASE for these enemies (base-supplying read, not a layer); enemies
require NO new kernel `ComponentRegistry` key (they reuse existing components) —
`getEnemy` is the ONLY kernel edit, plus the `catalogRef` component CD3 introduces.

Enemy authored skills (`skillKeys` + `inlineSkills`, v1 `hydrateEnemySkills`) are
NOT a base-component fold input — where the combat layer reads them is the
skills/combat fork's seam (named, not owned here); the enemy Entity carries
identity/attributes/affinities/vitals/level (+ optional mechanics) only.

**Rationale.** The port MUST return an `Entity`, not an `EnemyDefinition`, or every
consumer (initiative, fallen, end-of-turn, the loader) branches on a second nominal
type — the `CombatantRef`-arm multiplication v2 exists to kill. An Entity means a
catalog enemy and a durable NPC are identical at the point of use; the golden-master
(v1 `statblockFromEnemy` vs v2 `resolve(getEnemy(key))`) only type-checks if the v2
side flows through the real fold. "Enemies have no SP" becomes the absence of the
`skillPool` capability, collapsing three v1 special-cases into one fact.

**Alternatives rejected.** (a) Port returns `EnemyDefinition`, loader converts —
keeps a second nominal type alive in the engine. (b) Author enemies as a fake
single-archetype to reuse the Archetypes layer — D37 corrected exactly this
anti-pattern. (c) Give every enemy `skillPool: { base: 0 }` for symmetry — resolves
AS a casting combatant and emits `sp: { current: 0, max: 0 }` instead of the
required structural absence.

**Adversarial critique resolution.** All critics confirmed `getEnemy → Entity` is
the F1-correct choice and SP-as-absent makes RED-4 structural. The cross-fork seam
(enemy skill-list home) was explicitly fenced to the skills/combat fork. Free-entry
inline enemies MAY author a `skillPool` (presence reflects reality) — the snapshot
/ redaction code must read presence per-participant, never assume "enemy ⇒ no SP"
(v1 already had this inline-vs-catalog split).

_PRESERVE:_ R3.4 (initiative stats via getEnemy → now uniform resolve), R12.3
(maxHP default via getEnemy), R13.2/FAL-1, R14.4, NAME-1/NAME-4, ROS-5/ROS-9.
_SUPERSEDE:_ v1 enemy "has no SP" as `EnemyStatBlock` field absence → absence of
the `skillPool` capability component (RED-4 `sp: null` structural).

---

### CD9 — Turn loop: uniform `compareInitiative(resolve)` + Fallen derivation + party composition — three v1 kind-branches deleted · **Settled**

_Builds on D29, D30, D1, F1._

**Decision.** Three derived helpers re-home onto the uniform resolved entity,
DELETING v1's three `ref.kind` switches (the canonical F1 pain — verified in
`initiative.ts`, `fallen.ts`, `party-composition.ts`).

- **(a) INITIATIVE (R3).** `compareInitiative(participants, resolve)` reads
  `resolve(p.entity).components.attributes` (agility/luck) uniformly; the v1
  three-arm `resolveStats` switch evaporates. PRESERVE R3.1–R3.3 (per-side highest
  Agility/Luck independent; `suggestedSide` non-empty > empty → Agility →
  Luck-tiebreak → null; both-empty null). SPEC INVARIANT (not a risk): a
  combat-eligible participant MUST resolve an attributes read-unit; the "ignored"
  arm is reserved for the genuine v1-analogue cases (no entity attached / catalog
  miss), never a resolve gap that silently drops a real combatant.
- **(b) FALLEN (R13).** `isFallen(currentHP) ⟺ currentHP <= 0` over
  `resolve(p.entity).components.vitals.currentHP`, uniformly; the
  pc/enemy/catalog-enemy branch in `fallen.ts` is deleted; the Fallen set is derived
  fresh each read, never stored; revive is automatic (no event). PRESERVE R13.1;
  edge R13.2: an entity that resolves with no vitals read-unit → not Fallen (the
  PC-absent default); an unknown `catalogKey` → degenerate entity maxHP 0 →
  currentHP 0 → Fallen (the resilient fallback, MANDATED not optional — an
  err-and-drop would break R13.2/NAME-1).
- **(c) PARTY COMPOSITION (R15/PC-1/PC-2).** `derivePartyComposition` keys on a
  participant carrying a resolvable Lineage/Archetype-derived signal (the v2
  analogue of v1's pc-ref + active Archetype), NOT `ref.kind` — an entity with no
  resolvable Lineage is skipped; enemy entities (no Archetypes) are naturally
  skipped. Sparse, keyed over LINEAGES.

Turn-loop reducer mechanics (draft resets used-counts + clears Downed; endTurn
increments `turnsTakenThisRound` + ticks the acting actor's durations; advanceRound
zeroes counts + nulls actor; addParticipant joins at `turnsTakenThisRound = 1`;
setActed maps to the count, see CD10) PRESERVE R4–R7.

**Rationale.** R3.4's `resolveStats` is a verbatim `CombatantRef` kind-switch, the
canonical pain D1 exists to kill. Because the loader (CD3) already dissolves storage
into `Participant.entity` and resolve (D30) emits `attributes`/`vitals` uniformly,
the three-arm branches evaporate into single resolve reads — the thesis working at
the Session's center. Passing `resolve` itself (not a precomputed stats map) keeps
the helpers agnostic over provenance and avoids a stale-map bug.

**Alternatives rejected.** (a) Pass `attributesByParticipantId` into
`compareInitiative` — re-introduces provenance-shaped inputs (the thing R3.4's
branch encoded). (b) Keep an explicit `hasActedThisRound` boolean — D21 makes
turn-count the substrate; `turnsTakenThisRound > 0` is the boolean. (c) Err-and-drop
on a catalog miss — would break R13.2/NAME-1; the degenerate-entity path is
mandated.

**Adversarial critique resolution.** The completeness report flagged Fallen (R13)
and party composition (R15/PC-1/PC-2) as UNHOMED — both now homed here, alongside
initiative, as the trio of kind-branch eliminations. Party composition is the one
remaining F1-class kind-branch in a derived helper that no prior draft had
converted; converted to a capability/derived-Lineage predicate. R13.2's catalog-miss
resolved to the MANDATED degenerate-entity path (not the open err-vs-degenerate
question).

_PRESERVE:_ R3.1–R3.3, R13.1, R14 (end-of-turn obligations), R4–R7. _SUPERSEDE:_
R3.4, R13.2, R15/PC-1/PC-2 (ref-kind → uniform resolve / capability predicate).

---

### CD10 — Action economy: consumption `TurnState` + constant base budget under parity; `turnsPerRound` is the multi-turn substrate, the frozen budget struct deferred · **Settled**

_Builds on D21, D29._

**Decision.** `TurnState = { movesUsed; standardsUsed; reactionsUsed;
turnsTakenThisRound }` — pure CONSUMPTION (D21), SUPERSEDING v1's three `*Available`
booleans + `hasActedThisRound`. `available = resolvedBudget − used`;
`hasActedThisRound ≡ turnsTakenThisRound > 0` (derive where selectors need it; don't
store both). `setActed` maps to the count with a forward-safe clamp: `setActed(true)
→ Math.max(turnsTakenThisRound, 1)` (never LOWER an existing higher boss count),
`setActed(false) → 0`.

The accepted **revision** (F4 SIMPLICITY critic): under the v1-parity tracker the
budget is the CONSTANT `{ moves: 1, standards: 1, reactions: 1, turnsPerRound: 1 }`;
`available = 1 − used` needs NO stored snapshot. DEFER the frozen `TurnBudget`
struct on `TurnState` AND the draft-time resolve-snapshot to the same seam that owns
Follow-Ups/Shift/All-Out/Synthesis/Boss-multi-turn — every field of the budget
struct except `turnsTakenThisRound` serves only deferred features, and storing it
ships a self-described staleness footgun for zero in-scope payoff. KEEP
`turnsTakenThisRound` as the cheap multi-turn substrate; the drafting selector
comparing `turnsTakenThisRound < turnsPerRound` is a pluggable variant (single-turn
default ships; `turnsPerRound` is a future resolved/session-derived input, NOT a
stored field, until a deferred rule consumes it). The reducer NEVER enforces a turn
cap (R4.3 — advisory selector input only).

**Rationale.** D21 mandates consumption-not-availability, so the four v1 booleans
collapse into `*Used` counts + `turnsTakenThisRound`. The original draft stored a
frozen `TurnBudget` snapshot to honor D21's "snapshotted at turn start" phrasing —
but under parity the budget is constant, so the snapshot's only consumers (boss
multi-turn, zone grants) are all deferred; storing it now is anticipatory and a
staleness footgun.

**Alternatives rejected.** (a) Store the frozen `TurnBudget` snapshot now — all
consumers deferred; ships staleness for zero payoff. (b) Keep
`hasActedThisRound` alongside the count — drift bait; derive it. (c) Recompute the
budget on every read once the struct lands — would lose D21's start-of-turn-in-zone
grant; but that is a deferred-seam concern, not in-scope.

**Adversarial critique resolution.** The F4 SIMPLICITY critic REFUTED the frozen
`TurnBudget` snapshot as anticipatory (consumers all deferred) — ACCEPTED, store
consumption-only, defer the budget struct + snapshot semantics. The F4 parity
critic flagged that `setActed` must not corrupt the deferred boss count — ACCEPTED
the `Math.max` clamp. The "shell pre-resolves vs reducer takes resolve" question
(which the deferred snapshot raised) is moot under parity since the budget is
constant; when the budget struct lands later, the shell resolves it and the draft
event carries plain numbers (reducer stays catalog-free, CD4).

_SUPERSEDE:_ R7.2 (acted boolean → `turnsTakenThisRound` count, forward-safe), R11
(availability → resolved budget − consumption).

---

### CD11 — Redaction: one (component × relationship) table + relationship resolver + pure `visibleEntity` fold (structural key-drop) · **Settled**

_Builds on D20, D25, D14, F2, F4._

**Decision.** ONE enumerated, total `Record<ProjectableKey, Record<Relationship,
'public' | 'drop'>>` table is the single source of truth (F2). `Relationship =
f(viewer, allegiance, ownership) ∈ {own, ally, opponent, spectator, dm}`, computed
ONCE per (entity, viewer) by a pure resolver with precedence: `dm` → `own`
(`viewer.ownedEntityIds.has(entity.id)` — an OWNERSHIP capability keyed on
`entity.id`, NEVER `kind === 'pc'`, which is what makes a charmed PC read `own` to
its controller and `opponent` to its old party) → `spectator` (no side) →
no-allegiance fail-safe `spectator` → side-match `ally` → else `opponent`.

`visibleEntity(entity, viewer)` computes relationship once then folds the table:
the per-component verdict `visibleFor(key, rel)` takes NO entity argument (cannot
breed a per-call-site branch, F2); `'drop'` = the key is NEVER written (structurally
absent on the wire, never null — PRESERVE the v1 contract, RED-4); un-policied keys
default to drop (defence in depth). Redaction runs over the RESOLVED entity
(resolved read-units only — it never sees authored `damage`/`spSpent`). The table:
identity/vitals/skillPool public to all; attributes/affinities public to
own/ally/dm, DROP to opponent/spectator (the ONLY two drop rows, RED-4);
ailments/battleConditions/conditionDurations/counters/allegiance public to all
(RED-2); a `presentation` row (carrying `portraitUrl`, ADR §2.7) public to all five
arms.

**Rationale.** This is the literal artifact F2 demands: a single declared table,
`visibleEntity` a pure fold with no entity argument. Enumerating attributes/
affinities as the only two drop-on-opponent rows reproduces the security-critical
v1 contract (RED-4) while everything else is public (RED-2/RED-3). The total
`Record` type turns "did we forget a component?" into a compile error. This
SUPERSEDES v1's kind-keyed two-arm `projectPlayerSnapshot` — strictly better: a
charmed PC (own → public to controller, opponent → drop to old party) and a
revealed NPC ally (ally → public) both fall out with zero new branches.

**Alternatives rejected.** (a) Per-component policy co-located on each schema
module — scatters the security contract across ~11 files; F2's "asserted, never
written down" violation. (b) Default-deny by omitting public cells — a forgotten
row would silently hide an enemy's HP; totality + explicit `public` makes every
decision reviewed (default-deny is right for the *envelope*, CD12, not this small
total table). (c) A three-value verdict to anticipate field-level (`zoneId → ""`) —
field-level is spatial-ADR scope; keep `public|drop` binary.

**Adversarial critique resolution.** Parity critic REFUTED the draft on a real
PRESERVE break: the table omitted `presentation`, so `portraitUrl` (required on the
wire by RED-3/PV-2/DRD-3 via the ADR §2.7 Presentation component) was structurally
dropped for everyone via default-drop. FIXED by ADDING a `presentation` row, public
to all five arms. Simplicity critic: `engagement` is a Tier-3 scope leak in the
non-spatial table — REMOVED from `ProjectableKey` (Engagement is D28-deferred, homed
on the spatial occupancy token); RED-2's `engagedWith` is satisfied by the envelope
projector emitting a stub `engagedWith: []` (CD12), NOT a redaction cell. Thesis
critic: the draft's vitals/skillPool "authored ∪ resolved F3-smear" risk-note is
stale (verified: `ResolvedVitals` is derived-only `{maxHP, currentHP}`) — risk-note
dropped. A release-gate structural-absence test (seed an opponent WITH
attributes+affinities, assert `'attributes' in projected === false`) is MANDATORY
(security-critical, D14), not a risk note.

**AMENDED (CD13/CD17, spatial-seam revision).** The table stays **BINARY**
(`public | drop`) — this CD's arity is untouched, and field-level (`zoneId → ""`)
stays OUT of it. The single change: **`engagement` is added BACK to `ProjectableKey`
as a PUBLIC-to-all-five-arms row** (RED-2), reversing this CD's removal of it as a
Tier-3 scope leak — now that Engagement is a real projected read-unit (CD13/CD14).
`position` is likewise a public-to-all read-unit in the merged bag. `attributes` /
`affinities` remain the only two drop rows. Future fog-redaction of `zoneId`
(RED-9c) is a POST-FOLD field transform the spatial projector composes OVER this
binary table, NEVER a third verdict in it.

_PRESERVE:_ RED-2 (now incl. a real `engagement` row, CD17), RED-3, RED-4 (now a
relationship table row; structural-absence test mandatory). _SUPERSEDE:_ v1
kind-keyed two-arm `projectPlayerSnapshot` → relationship-keyed fold.

---

### CD12 — Snapshot envelope projector (whitelist, default-deny) above `visibleEntity`; spatial fog/fields deferred · **Settled**

_Builds on D20, D25, D29, F5._

**Decision.** A snapshot-envelope projector sits above `visibleEntity`, two
single-purpose passes:

1. The ENVELOPE is a whitelist (default-deny) of session-level fields — `status`,
   `name`, `campaignShortId`, `version`, `round`, `currentActor: {id, name, side}`
   subset (RED-5), `combatants[]` — viewer-UNIFORM (RED-1 fields are identical for
   every viewer; the DM's richer view comes from reading the full session directly,
   never a fatter envelope). A new session field is invisible until whitelisted
   (inverse of v1's leak-by-default).
2. Each combatant is redacted by `visibleEntity` (CD11) — the only
   relationship-driven step. `engagedWith` is emitted as a STUB `[]` for every
   combatant (matches v1 `resolveCombatantEngagement` returning `[]` when Free) so
   the wire shape is stable across the Tier-3 cutover — NEVER computed from a
   (non-existent) engagement component. `instanceVersion` is a SPATIAL
   (Map-Instance) token — the non-spatial envelope OMITS it; the spatial ADR adds
   it.

Disambiguated combatant display names (NAME-3) and roster order (RED-1) are applied
by the encounter-view layer when assembling `combatants[]`, NOT inside
`visibleEntity` (identity carries the raw name; the projector overlays the
disambiguated label) — single home for numbering.

DEFER explicitly to the spatial Tier-3 ADR (which composes OVER this envelope,
purely additive): field-level redaction (`zoneId → ''`), fog-gating (RED-8/9),
zone/adjacency/enchantment (RED-6/7), all DRD-* dungeon fog. Realtime (CD7): the
encounter channel pings overlay + ephemeral-enemy vitals; the per-entity channel +
composite entity-version dimension is the named-but-unbuilt durable seam.

**Rationale.** RED-1 enumerates the always-emitted top-level fields; a whitelist
makes that list the literal source of truth and turns leakage into a compile/review
event. Separating the envelope (field-whitelist) from entity-redaction
(relationship-fold) keeps each pass single-purpose: the envelope never consults
relationship, `visibleEntity` never knows about session fields. Drawing the spatial
seam as composition (the spatial projector wraps this one) keeps the non-spatial
layer zero-spatial-import.

**Alternatives rejected.** (a) One monolithic projector that emits session fields
AND redacts combatants AND fog-clamps zones (v1's `projectPlayerSnapshot`) — mixes
three concerns and forces the non-spatial layer to know reveal state. (b) A
relationship-aware envelope (DM gets a richer envelope) — RED-1 fields are identical
for every viewer; the DM reads the full session directly. (c) Carry
`pendingEffects` into the snapshot — display-only DM producer, out of locked scope;
would leak attack math.

**Adversarial critique resolution.** Completeness report: `engagedWith` (RED-2) has
no source under non-spatial scope — RESOLVED to the stub-`[]` contract (decided, not
deferred), keeping RED-2's wire shape stable. `instanceVersion` spatial-leak
self-flagged by the draft — RESOLVED to OMIT in the non-spatial envelope. NAME-3
numbering home pinned to the encounter-view layer (single-home rule). The
view-shaper requirement families (SEL/NAME/CON/ROS/PV-spatial) are the sibling
encounter-view fork, fenced in the open questions.

**AMENDED/SUPERSEDED (CD17, spatial-seam revision).** `engagedWith` is no longer the
unconditional `[]` stub — it becomes a **REAL read of the projected Engagement
component** (CD13/CD14) via the v1 `engagedWith()` accessor (`engaged ? targetIds :
[]`), folded through the CD11 table as a public-to-all row (CD17). The wire is
byte-identical when Free (no migration); it resolves to `[]` *structurally* in the
mapless case (no occupancy token ⇒ Engagement-capability absence) and when Free — so
the old stub is recovered as a real structural result, strictly better in both. The
rest of the CD12 envelope is unchanged: `pendingEffects` stays excluded (Toccata
display-only, CD15); `instanceVersion` stays OMITTED (the spatial projector adds it);
field-level (`zoneId → ''`) + fog-gating (RED-8/9) + zone/enchantment SNAPSHOT
projection (RED-6/7) stay DEFERRED to the spatial projector composing over this
envelope. Only the resolve-INPUT enchantment read (CD15) and the `engagedWith` READ
(this amendment) are un-deferred.

_PRESERVE:_ RED-1 (whitelisted top-level fields; `instanceVersion` omitted as
spatial-sourced), RED-2 (`engagedWith` now a REAL Engagement read, CD17), RED-5
(currentActor subset). _SUPERSEDE/DEFER:_ RED-6/7/8/9 + DRD-* → spatial Tier-3 ADR.

---

## Decisions — the spatial seam (CD13–CD17)

The revision that designs combat *over a spatial seam* (the user call after the first
pass over-deferred spatial). Spatial is a **substrate** combat reads via a **one-way
dependency** (combat → spatial; spatial stands alone in dungeon exploration). These five
pull the narrow READ seam forward; the heavy spatial INTERNALS stay deferred (the
parity guards in "Locked scope" hold). Grounded in v1: the Map-Instance is a
**delve-scoped** substrate shared with exploration (`reduceMapInstance` runs in
exploration with no combat session); PC tokens persist a fight (combat reuses the SAME
instance, only adds enemy tokens); `pruneCombat` keeps survivors' zoneIds at combat-end.

### CD13 — Position + Engagement are INSTANCE-lifecycle capability components in a sibling `InstanceRegistry`; the occupancy token is their authoritative home, written only by the spatial reducer · **Settled**

_Builds on D28, D29, F1; amends CD1._

**Decision.** Two capability components: `Position = { zoneId: string }` and
`Engagement = { status: 'free' } | { status: 'engaged'; targetCombatantIds: string[] }`
(v1's discriminated union verbatim — symmetric, same-zone). They carry a **THIRD
lifecycle, `instance`** (delve-scoped), beside `durable` and `overlay`. Their
**authoritative storage home is the Map-Instance occupancy token**, and they are
**written ONLY by the spatial reducer** (`reduceMapInstance` — combat NEVER writes
them; the symmetry invariant stays in the spatial engagement-graph primitives). They
live in a sibling **`InstanceRegistry`** rooted in `encounter/` — mirroring CD1's own
`OverlayRegistry` choice — **NOT** the kernel `ComponentRegistry` (which is the durable
entity-row vocabulary). The loader **projects** the occupancy token → Position /
Engagement into the participant's merged read-bag (CD14), so redaction/resolve see them
as ordinary components.

**Rationale.** v1's `pruneCombat` "keep survivor zoneIds, free engagement" is impossible
to express with CD7's two-lifecycle (durable/overlay) framing — position survives the
overlay sweep but dies with the delve. That forces the third lifecycle; it is not
speculative. Modeling them as real components (not a side-channel) is what makes
`engagedWith` a real redacted field (CD17) under the one uniform fold, with zero new
branch. `Position = { zoneId }` is the **minimum** combat needs (the zone-enchantment
read, CD15) — it pins no coordinate/geometry model.

**Alternatives rejected.** (a) Register them in the **kernel** `ComponentRegistry` (the
S4 draft) — REFUTED (major) by the thesis + over-constraint critics: that registry is
the durable entity-row vocabulary; membership forces a durable load-seam entry and
couples an instance-lifecycle, exploration-shared concern to the durable schema. The
sibling-registry mirror of CD1 is the correct home. (b) Keep them only on the instance
and read via a boundary selector (never in the bag) — then `engagedWith` can't be
redacted by the CD11 fold; the merged-bag projection is what un-stubs it cleanly.

**Adversarial critique resolution.** The kernel-registry error (a) was caught and
corrected to the sibling `InstanceRegistry`. Over-constraint critic: committing
`Position = { zoneId }` + the single-zoneId equality in `zoneEnchantmentEffects` fixes a
"one zone per participant for enchantment purposes" assumption — flagged Open (not
asserted fine): a future coordinate/multi-zone spatial model must still surface ONE
zoneId at the enchantment read (Open Q3). The constraint rides the enchantment-read
EQUALITY (CD15, engine-owned helper), not the component shape, so a multi-zone model
updates the helper, not Position.

**Over-constraint verdict.** LOW. Pins only the STATE shapes — already the shipped v1
foundation schemas on the occupancy token — not transition logic. The spatial reducer
keeps full freedom over how it stores/mutates the token, provided the loader can project
`{ zoneId }` / `{ engagement }`.

_PRESERVE:_ R1.1 edge (Position/Engagement live on the occupancy token, not the
combatant), R23.3 (positions survive combat-end), R24.5 (combat reducer writes no
spatial field). _SUPERSEDE:_ parent D28's "Position + Engagement are Tier-3-only" — the
READ components + the projection are pulled forward; the WRITE transitions stay deferred.

---

### CD14 — The loader ASSEMBLES the merged read-bag from THREE physical homes; instance keys are RAW pass-throughs injected post-resolve · **Settled**

_Builds on CD1, CD3, D30; amends CD1, CD3._

**Decision.** Reframe the one loader boundary from "**dissolves** a 2-arm storage
locator into `Participant.entity`" to "**assembles** the merged read-bag from its
**three physical homes** — durable row, session blob, instance token." The merged bag =
**RESOLVED durable read-units ∪ RAW overlay components ∪ RAW instance components**
(Position / Engagement). Overlay and instance are carried **raw** (no resolve pass,
exactly as overlay already is); instance keys are **injected AFTER `resolve` runs**, never
resolve-fold inputs. One pass-through mechanism: identity, position, and engagement are
all loader-injected post-resolve (identity's pass-through is reconciled onto the same
path). Each home stays a **separate WRITE path with its own version token**; the loader
only MERGES for read. The build-time disjointness assertion extends from 2-way to
**3-way** (a typed `INSTANCE_KEYS` const, `satisfies`-total, disjoint from BOTH
`OVERLAY_KEYS` and `keyof ComponentRegistry`).

**Rationale.** This is CD1's already-accepted `durable ∪ overlay` merge extended by one
home. The "assemble, not dissolve" framing is what keeps it from reading as a god-loader:
the boundary's job is read-assembly; writes stay split. The F1 kill is preserved —
downstream still names no storage home or token; the bag is a uniform key→component
surface; **no third storage DISCRIMINANT is added downstream**.

**Alternatives rejected.** (a) Fold instance components through `resolve` as a layer —
out of parity scope (they contribute no stat math) and would make resolve read spatial
state. (b) A second loader for the spatial half — splits one participant's assembly
across two boundaries (the F1 multiplication risk).

**Adversarial critique resolution.** Thesis critic: CD3's "one boundary" now hosts a
SECOND orthogonal projection (enchantment-effects, CD15) — ACCEPTED and named: the loader
runs two independent passes (storage assembly + effects assembly) over the same
participant; both are impure-shell, neither is engine logic. The 3-way disjointness
assertion supersedes CD3's 2-way one.

**Over-constraint verdict.** MODERATE-but-accepted. This is the decision that most
stresses CD3's "one boundary," but the projection step MUST exist for `engagedWith` to be
real — that is the point of pulling the seam forward. Minimal and accepted.

_PRESERVE:_ R1.5 (`toCombatantSetup` spatial half reads the SAME occupancy token this CD
projects — one path, not a second). _SUPERSEDE:_ CD3's "dissolves" framing → "assembles
from three homes"; CD1/CD3's 2-way disjointness → 3-way.

---

### CD15 — The combat→spatial read-interface: a narrow injected one-way `SpatialReads` port fenced to the zone-enchantment read; un-defer Toccata into `pendingEffects` · **Settled**

_Builds on D21, the v2 `resolveEntity` context channel; ground truth R19.5._

**Decision.** The combat→spatial seam is a tiny **injected** interface the encounter
loader receives — `SpatialReads { zoneOf(participantId): string | undefined;
activeEnchantment(): ZoneEnchantment | null }` — **NOT** a spatial-state module the combat
engine imports. The loader reads `zoneOf(p) + activeEnchantment()` →
`zoneEnchantmentEffects(enchantment, zoneId)` → `ResolveContext.effects` →
`resolveEntity(entity, { effects })`. This **un-defers Toccata's attack-roll bonus into
resolution**, surfacing in `pendingEffects` (display-only per the locked parity scope, not
auto-applied). v2 is **already wired** — `mechanics/zone-enchantment.ts` (the helper) +
`resolveEntity(entity, context: { effects? })` exist; **only the loader projection is
new**. The dependency is **one-way**: combat declares what it needs; spatial implements.
Resolution NEVER reads spatial state directly — it reads effects.

**Rationale.** This is the **only** engine-modeled combat→spatial read in v1 (verified:
ranges are DM-adjudicated vocabulary, opportunity-attacks are prose). Fencing the seam to
exactly `zoneOf` + `activeEnchantment` keeps the surface minimal; the v2 resolve signature
was built for precisely this injection.

**Alternatives rejected.** (a) Import the Map-Instance state into combat — two-way coupling,
the thing the seam exists to avoid. (b) Add a `validTargets(range, positions, engagement)`
resolver — REFUTED as parity scope creep (v1 has none; ranges are DM-adjudicated). (c) Make
the action budget read Tarantella's action grant — Tarantella returns `[]` (prose); the
budget stays constant 1/1/1 (CD10).

**Adversarial critique resolution.** Parity critic confirmed: no `validTargets`, no auto
opportunity-attacks, budget stays constant — pulling Toccata into `pendingEffects` is the
PRE-EXISTING display channel, not new auto-resolution. Over-constraint critic flagged the
parameterless singleton `activeEnchantment(): ZoneEnchantment | null` as the one forward
constraint (it bakes the one-active-enchantment rule into the seam type) — accepted as
matching v1/v2 ground truth exactly (one Bard, one nullable enchantment), and cheap to
widen: `zoneEnchantmentEffects` already does the `enchantment.zoneId === zoneId` match
internally, so a future multi-enchantment model swaps `activeEnchantment()` for a per-zone
lookup without touching the loader. Flagged as the single widening point; **recommend NO
widening under parity**.

**Over-constraint verdict.** LOW. Names only `zoneOf` + `activeEnchantment`; the spatial ADR
is free to add adjacency/reveal/engagement reads as separate seams.

_PRESERVE:_ R19.5 (`zoneEnchantmentEffects` → resolve effects; Toccata = attackRoll bonus =
forte; Requiem/Tarantella = `[]` prose, a named-but-unbuilt seam). The single engine-modeled
combat→spatial read.

---

### CD16 — The `reduceEncounter` composition wrapper + the changed-rows `guardMany` seam; combat-end is a COMPOSED (overlay-sweep + spatial-prune) atomic action · **Leaning**

_Builds on D28, D29; amends CD7; homes R1.3 / R23.2 (completeness)._

**Decision.** A composition tier sits above the two pure reducers over
`EncounterState = { session: Session; instance: MapInstanceState }`. It routes combat
events → the session reducer (CD4), spatial events → the spatial reducer
(`reduceMapInstance`), and **owns the cross-cutting events** that touch both rows in ONE
`guardMany` transaction over the **two version tokens** (`encounter.version` +
`mapInstances.version`), driven by a same-ref **changed-rows diff**:

- **Birth (R1.3):** `createCombatSession` + `createMapInstance` are **co-invoked from one
  `setup[]`** at the composition root — the symmetric twin of combat-end prune — so the
  occupancy token exists before the first load and `participantId === token key` is
  established at birth (occupancy + roster share ids), not patched at first move.
- **`addParticipant ↔ addOccupant`**, **`removeParticipant ↔ removeOccupant`** (R23.2:
  `removeOccupant` performs the **symmetric engagement-sever** — a SPATIAL-helper
  obligation the composition COMPOSES but never performs itself; `removeParticipant`
  still nulls the actor only, R6.3).
- **`startCombat`:** placement gate + status flip (the gate stays an **impure-shell
  precondition** — `reduceEncounter` reads no geometry/occupancy field).
- **Combat-end:** a **COMPOSED** action = the overlay sweep (combat-owned `OVERLAY_KEYS`
  drop) + a spatial `pruneCombat` (drops enemy tokens, frees survivor engagement, clears
  enchantment, **keeps survivor zoneIds** — a SPATIAL write, NOT the overlay drop) + the
  status-column flip, atomic over both tokens.

The `instance` field stays **opaque** (geometry/fog/reveal/reducer internals untouched —
the spatial ADR owns them).

**Rationale.** Lifting v1's implicit shell composition into a designed, testable seam:
compiler-enforced routing exhaustiveness and pure golden-master cross-write atomicity
tests, with the shell shrinking to `load → reduceEncounter → persist`. The changed-rows
diff is strictly less constraining than v1's hand-written if-ladder.

**Alternatives rejected.** (a) One fused reducer over all spatial + combat state — bundles
the large, exploration-shared spatial subsystem into combat; spatial outlives combat. (b)
Leave composition implicit in the apps/web shell (v1) — works, but loses the pure
atomicity tests; this is the open residency call below.

**Adversarial critique resolution.** Parity critic: `endCombat` as a NEW first-class
wire-event has no v1 analogue (v1 combat-end is a shell-composed `guardMany`, not an
event) — RESOLVED to a composed ACTION, leaning shell-composed today (the status flip
forces a shell write regardless). Over-constraint critic: `EncounterState` naming
`MapInstanceState` as a field type — accepted as opaque (no internal field is read).
Completeness critic homed R1.3 (birth co-construction) + R23.2 (sever as spatial-helper
obligation) here as the symmetric twins of combat-end.

**Over-constraint verdict.** LOW. Ratifies v1's shipped design (own instance version,
`guardMany` over two tokens, `pruneCombat` keeps positions, single-zone enchantment
equality). `instance` opaque; the placement gate stays a shell precondition. **Leaning,
not Settled** — the composition CONTRACT is settled; two residency calls are open: whether
to ship a literal `reduceEncounter` wrapper (recommended) vs. a documented shell pattern
(Open Q6), and whether combat-end becomes a pure `endCombat` arm vs. stays shell-composed
(Open Q7).

_PRESERVE:_ R1.3 (co-mint session + instance from one setup[]), R6.3 (removeParticipant
nulls actor only), R23.1/R23.2/R23.3 (addOccupant/removeOccupant-sever/pruneCombat as
spatial-helper obligations the composition calls), the two-version `guardMany` cross-write.

---

### CD17 — Un-stub `engagedWith`: a REAL read of the projected Engagement component, folded by the CD11 table as a public-to-all row · **Settled**

_Builds on CD11, CD12, CD13, CD14, RED-2; amends CD12._

**Decision.** Replace CD12's hardcoded `engagedWith: []` with a **real read** of the
projected Engagement component via the v1 `engagedWith()` accessor (`engaged ? targetIds :
[]`), folded through the same CD11 `(component × relationship)` table as a **public-to-all**
row (RED-2). The wire is **byte-identical when Free** (no migration). It resolves to `[]`
**structurally** in the mapless case (no occupancy token ⇒ Engagement-capability absence)
and when Free — so the old stub is recovered as a genuine structural result, strictly
better in both.

**Rationale.** Once Engagement is a real projected read-unit (CD13/CD14), the stub is
vestigial: the same uniform fold that redacts every other component now produces
`engagedWith` for free, with zero new branch. RED-2 makes it public-to-all, so it changes
**zero redaction cells** — the cleanest possible un-stub.

**Alternatives rejected.** (a) Keep the `[]` stub — discards real engagement data the
DM/watch can now show. (b) A bespoke engagement redaction path — re-fragments the single
redaction fold (F2).

**Adversarial critique resolution.** Thesis/over-constraint critics: the un-stub does NOT
design the engagement WRITE path (deferred), does NOT pin the Engagement internal shape
(CD13 owns it, abstracted behind the accessor), and does NOT touch fog/field-level
redaction (deferred, composed OVER the binary table). The only forward constraint —
Engagement public to all five arms — is RED-2 spec-mandated, not invented here.

**Over-constraint verdict.** VERY LOW. A pure un-stub behind the CD13 accessor.

_PRESERVE:_ RED-2 (`engagedWith` present, public to all). _SUPERSEDE:_ CD12's `engagedWith:
[]` stub → a real Engagement-component read.

---

### CD18 — Vitals storage-routing is an impure `updateVitals` application-service, NOT a `vitalsHome` flag on the pure Participant · **Settled** · _supersedes the `vitalsHome` mechanism of CD6; amends CD2, CD7_

_Builds on D7, D29, CD3, CD6, CD7, and the corrected write premise (encounter-write-architecture.md)._

**Decision.** The decision "does this participant's vitals write go to the session blob
(ephemeral → reduce + `saveEncounterSession`) or the entity row (durable → per-field
owner-mode action)" is owned by a **client+server `updateVitals` command pair** (op = the
CD6 family: `damage` / `heal` / `setMax` × `hp` / `sp`) — **not** a purely server-side
service: because the UI updates **optimistically**, the client must predict the write, so
the routing decision spans both sides.

- **Client dispatch** (the headless combat console — v1's `use-combat-console` /
  `dispatch-event`): reads the participant's storage home from the **client view model**,
  optimistically applies (ephemeral → run the pure session reducer locally + re-render, as
  v1's `applySessionOptimistic` does; durable → update the local PC-vitals display), and
  fires the matching server action.
- **Server action** (`apps/web`): validates, authorizes, persists via the right path +
  version + channel, returns the new version to reconcile.

The presentational **widget** still expresses **intent only** (`updateVitals(participantId,
delta)`) and decides nothing — the decision lives in the client *app layer* + the server
action. The storage home is read on **both** boundaries — the **client view model**
(optimistic routing) and the server's out-of-band locator map (CD3's `StoredEntityLocator
{ storage }`, persist routing) — but **never** on the pure engine `Participant` or reducer
(the engine win holds; per the F1-containment critique the branch is *consolidated to the
app boundaries*, not eliminated). The server action routes:

- **ephemeral** → reduce the CD6 session vitals event → `saveEncounterSession` (one blob
  write, one version, CD7a);
- **durable** → the per-field owner-mode entity action (read row → `applyDamage` /
  `applyHeal` on the authored vitals → write row, bump entity version, CD7b) — **no
  reducer involved**;

and routes **authorization** with it (DM-only for the ephemeral encounter write;
owner-or-campaign-DM for the durable PC/NPC pool — the two auth rules v1 already has).

**Consequences for the engine layer:**

- **`vitalsHome` is REMOVED** from the runtime `Participant` (CD2) and from the pure
  reducer (CD6). The storage fact stays where it already lived — the impure locator map —
  read by `updateVitals`, never copied onto pure data.
- The reducer's CD6 vitals events (`damageParticipant` …) are **ephemeral-only by
  construction**: the service never dispatches a durable vitals write *as a session
  event*, so the reducer applies over the inline authored `vitals` unconditionally. The
  only residual guard is **capability presence** of an inline authored `vitals` component
  (structurally satisfied for ephemerals; a thesis-pure no-op, not a storage flag) — no
  `vitalsHome` lifecycle branch.
- The **end-of-turn Burn/Sleep apply (R14.4)** funnels through the SAME service: the
  obligation projection stays pure but emits a uniform **delta intent** ("apply −⌊maxHP·
  10/100⌋ to participant X"), and the shell hands it to `updateVitals`, which places it.
  This SUPERSEDES R14.4's producer-side "apply is null for a durable combatant / a
  concrete enemy-HP value for inline" — the producer no longer pre-routes by storage or
  pre-computes an absolute enemy value; one intent, routed once.

**Rationale.** The whole app rests on **"the UI is dumb — it expresses intent, a
server-side use-case orchestrates; the UI never decides."** The durable/ephemeral vitals
split introduced exactly the decision the UI must not make — and it bites hardest on a
**capability-uniform combatant surface** (the DM console's all-combatants HP list, the
surface D7's uniform rendering pushes you toward). `updateVitals` is the **write-side
dual of D7**: D7 made *rendering* capability-uniform (one `HealthBar` for any entity, no
kind branch); a uniform read model with a *forked* write model is internally
inconsistent, and the inconsistency surfaces precisely at a unified edit surface, where
the widget would have to re-introduce the storage branch D7 eliminated. The service
absorbs it, so "render every combatant the same" extends to "write every combatant the
same." Placement is forced by purity: routing chooses between **persistence mechanisms + auth**
(the server half, in Server Actions) and **optimistic strategies** (the client half, in the
headless console) — both impure, neither in the pure engine, which **de-couples it from
CD16's** composition-tier residency question (CD16 stays a pure-reducer concern; vitals
routing is never its job). Relocating the storage fact off
the pure `Participant` also sheds a storage tag from the pure core — a small F1 win.

**Alternatives rejected.** (a) `vitalsHome` flag on the pure Participant + in-reducer gate
(prior CD6) — duplicates the locator's `storage` bit onto pure data solely for in-reducer
self-defense, leaks a storage concern into the pure reducer, and still forces a unified UI
surface to either know storage or lean on the reducer's silent no-op. (b) Route inside the
pure `reduceEncounter` tier (CD16) — wrong layer: a pure fold cannot dispatch a row write;
routing is impure. (c) Two leaf actions the UI picks between (v1's de-facto model) — works
only because v1's *surfaces* are split (character sheet vs DM console); it breaks the
moment a single surface edits any combatant (D7), re-leaking the kind/storage branch into
the UI. (d) Belt-and-suspenders (service routes AND the reducer keeps its gate) — redundant
defense; "one decision-maker, everyone else dumb" is the app's stated philosophy, so a
single well-tested router is the consistent choice.

**Adversarial critique resolution.** _(stress-tested by a focused critic panel — purity /
thesis-containment / parity+R14.4 / YAGNI; folded below.)_

**Over-constraint / scope.** An **`apps/web` application-layer** decision; the engine layer
only *simplifies* (CD6 loses `vitalsHome` + the gate; the R14 producer emits a delta
intent). No new engine machinery; `updateVitals` reuses the two write paths CD7 already
specifies — it only **chooses** between them in one place.

_SUPERSEDE:_ CD6's `vitalsHome`-on-Participant + the in-reducer lifecycle gate → the impure
`updateVitals` router (reducer vitals events ephemeral-only-by-construction); R14.4's
producer-side null-for-durable / absolute-enemy-value apply → a uniform delta intent routed
by `updateVitals`. _PRESERVE:_ the actual write targets (ephemeral → blob / CD7a, durable →
row / CD7b), the operation clamps (CD6/D10), and the two auth rules (DM-only vs
owner-or-DM).

**GENERALIZED by CD19.** Everything here is preserved verbatim and absorbed: `updateVitals` becomes
the **`vitals` writer** of the registry-driven session write-router (CD19) — there is no standalone
`updateVitals` action; it is `writers/vitals.ts`, invoked `applyCombatantWrite(ctx, { participantId,
component: 'vitals', op, args })`. CD19 pins the two structural mechanisms this CD left implicit (the
wire-union exclusion, CD5/CD19; per-arm token/channel/auth ownership) and CD20 extends single-write to
the multi-home batch.

---

### CD19 — The generalized impure session write-router: per-component `Writer`s composed with two per-home `Store`s, over the engine's existing pure ops · **Settled** · _generalizes CD18; amends CD3, CD5_

_Builds on D7, CD3, CD4, CD5, CD6, CD7, CD16, CD18; the root CLAUDE.md Registry guidance._

**Decision.** Generalize CD18's vitals-only client+server pair into ONE registry-driven impure
write-router homed at **`apps/web/lib/actions/combat-write/`**. Vitals is not special: a boss's
**Mechanic**, a friendly-ephemeral NPC's **SkillPool**, and **Prisma** all hit the same storage-home
fork, and the ONLY thing that varies by home is plumbing (store, token, channel, auth).

- **Entry point** — `applyCombatantWrite(ctx, write)`, `write = { participantId, component, op, args }`.
  The write carries **no storage field** (a caller cannot assert a home). The home is the **stored
  shape** — a participant is stored as an inline `entity` (ephemeral) or an `{ entityId }` reference
  (durable) — so it is **derived, never a tag** (no `home`/`vitalsHome`/`storage` field; CD3 tightened).
  Server and the routing client (the DM console, which holds its own local session) derive it the same way.
- **Two axes, composed by the router (the load-bearing shape).** A write = a per-COMPONENT **Writer**
  (the pure _what_) ∘ a per-HOME **Store** (the impure _where_):
  - **`Writer`** — ONE app-side `COMPONENT_WRITERS` registry keyed on component, built **over the
    engine's existing pure ops + mechanics registry** (no second engine registry — F1). Each entry is
    just `{ component; durableClass: VersionClass; applyOp(entity, args, deps) → Result<Partial<Component>> }`
    — the **only** per-component code.
  - **`Store`** — a small **factory** returning a shared interface `{ read(); commit(patch) → { token,
    value, channel }; auth }`. There are **exactly two**, written **once**: `sessionStore` (commit =
    dispatch a router-only `ComponentWriteEvent` through the pure reducer + `saveEncounterSession`, so the
    reducer stays the single pure session-writer, CD4; `encounter.version`; `encounter` channel; DM-only)
    and `entityRowStore(entityId, durableClass)` (commit = a per-field owner-mode read-merge-write; the
    entity's per-class version; entity channel; owner-or-DM). `storeFor(participant, writer)` picks one
    from the derived home.
  - **Router body has no branch:** `const store = storeFor(p, writer); return store.commit(writer.applyOp(store.read(), …))`.

  This is **Abstract Factory + Strategy** (a factory selecting one of two storage strategies behind one
  interface), **not** DI — natural to confuse, since a factory is the usual way to pick which impl to
  inject. The payoff that fixes the prior smell: **auth / token / channel are per-HOME, so they live on
  the two Stores — not duplicated on every Writer** (the earlier "Writer carries auth/token/channel per
  arm" spec was the same duplication smell one level up). Runnable sketch:
  [`write-router.example.ts`](./write-router.example.ts).
- **Client+server optimistic pair** (CD18 generalized): re-points v1's proven dual-token protocol; not
  a new concurrency mechanism — the client composes the same `Writer ∘ Store` over its local session.
- **Built now:** `vitals`, `skillPool`, `resources`, `mechanics` (the four with real ephemeral
  consumers + shipped ops). **Deferred (router-shaped, no consumer/op):** `exhaustion` (no op),
  `equipment` (no surface + a second `inventory` version-class). **Excluded:** overlays (generic DM-only
  wire), spatial (spatial reducer), **archetypes/form-swap** (an `applyForm(Entity→Entity)` transform,
  not a patch — its own future path), derived units.

**The honest spec (the naive premise refuted against source).** The shared abstraction is NOT a
uniform `(Component, args) → Component`: engine ops return **patches** (`Pick<Component, field>`), and
three of four writers need extra inputs — `resources` needs resolved `maxPrisma` injected; `mechanics`
has **no generic op** (bespoke per-mechanic transitions); `equipment` (deferred) is curried with
catalog ports + `newId`. So `applyOp` carries a per-writer **`WriterDeps`** bag (resolved context +
ports), supplied **identically** by client and server (from `resolve(entity)` / bound ports) so
optimistic prediction can't diverge. **Mechanics is two-level:** the outer router routes by home; an
inner `MechanicKind → transition` sub-dispatch handles `adjustValor(state, delta)` / `setFrenzyMode(state,
on)` / `setStainSlot(state, i, el)` over `states[kind]` (preserving F6), and the transition crosses the
wire as a **serializable descriptor** (`{ op: 'adjustValor', delta }`), never a closure — so the
optimistic mirror + golden-master hold. (`durableClass` lives on the app-side writer, never the engine
— F1.)

**Structural-ephemeral-only (a mechanism, not a convention).** The component-write session events
**leave** the generic `CombatEvent` union and become a **router-only `ComponentWriteEvent` family
excluded from `ApplyCombatEventSchema`** (a wire-schema split) — so a durable target is
**unrepresentable on the generic wire** by type + parse (CD5 amendment). `reduceVitals` becomes the
vitals ARM of the component-write reduce (one switch arm; CD4's single exhaustive switch holds). The
residual arm-selection risk (a stale locator routing a durable write to the blob — invisible to a
capability guard, since the loader attaches durable components for render) is closed by the **server
locator being authoritative** (overrides any client hint) + a contract test (the ephemeral arm refuses
a `durable` locator; `ApplyCombatEventSchema` rejects every `ComponentWrite` kind) + `toSessionEvent`
un-exported outside the registry module.

**Rationale.** Four buildable writers + an open-ended set is the documented Registry-over-switch trigger
(root CLAUDE.md, cf. the Mechanics Registry); the alternative is not a thin switch but **N bespoke
client+server action pairs** — the very thing being generalized away. The registry collapses them to N
data entries + 2 generic entry points: the user's "specific, predictable places" ("how do I add a
writable component" has one answer, `writers/<component>.ts`). ONE app registry over existing engine ops
is the honest layer split — pure ops + mechanics registry stay storage-blind in game-v2 (F1); routing
facts (home/token/channel/auth/optimistic strategy) live at the impure boundary.

**Alternatives rejected.** (a) A second engine-side pure-op registry — vestigial; risks re-leaking
storage into F1-pure code. (b) Ephemeral arm hand-mutates the blob — fragments CD4's
single-pure-session-writer. (c) A uniform op signature — refuted by source (patches + deps + bespoke
mechanics). (d) N bespoke action pairs — the thing the user asked to generalize away.

**Adversarial critique resolution.** The patch-contract, two-level-mechanics, wire-schema-split,
`durableClass`-on-the-app-side, and durable-arm-selection-test hits were all folded above. One critic
flagged the registry as premature at ~3–4 entries (over-abstraction); **answered**: the baseline isn't a
thin switch, it's N bespoke client+server pairs, and the writable set is open-ended — the documented
Registry trigger — so the registry earns its place, *provided* the hard build-fence holds (writers only
for a component with a real consumer + a shipped op).

**Over-engineering verdict.** Clean with a hard fence — and the `Writer ∘ Store` split *shrinks* the
surface the over-abstraction critic worried about: the **two Stores are written once**, and the only
per-component code is a Writer (a pure-op + a class tag). So the "registry" is **two fixed storage
strategies + a small pure-op table**, not a framework. Honest cost: adding a writable component is still
a **two-layer edit** (a pure reducer slice in game-v2 + a Writer entry in apps/web) — neither the registry
nor the stores collapse it to one; don't over-sell "one entry." `combat-write/` is a deliberate
two-auth-gate exception to actions/CLAUDE.md's one-gate-per-folder rule (the two gates now live on the two
Stores) → a nested CLAUDE.md legitimizes it. The v2 headless console doesn't exist yet, so the client half
lands with the v2 console PR. `setMax` / `adjustExhaustion` pure ops don't exist yet — ship them with the
Writer or scope out of MVP.

_PRESERVE:_ CD18's settled substance (client+server pair; ephemeral-only; capability no-op residual;
R14.4 through the router). _SUPERSEDE:_ CD5's vitals-on-the-generic-wire → the router-only
`ComponentWriteEvent` family; CD18's standalone `updateVitals` → the `writers/vitals.ts` **Writer**;
**CD3's explicit `storage` discriminant → the derived stored-shape** (no `home` tag — the union shape is
the home); the prior **"Writer carries auth/token/channel per arm" → two per-home `Store`s** (those facts
written once, not per Writer).

---

### CD20 — The multi-home / multi-write atomic batch · **Leaning** · _extends CD19; builds on CD7, CD16_

_Builds on CD7, CD16, CD19; the v1 `guardMany` two-token cross-write._

**Decision.** A single combat action (a skill cast) produces a write-**set** spanning combatants +
homes (caster SP-spend + target HP-damage + maybe a mechanic rank). `applyCombatantWriteBatch(ctx,
writes[])`: partition each write's home via the locator, then commit ONCE in a single `db.transaction`
— fold **all** ephemeral writes into ONE `createReduceSession` reduce → ONE `saveEncounterSession`
(preserving CD7a's single-blob-write / single-version-bump — a **hard rule**, else two ephemeral writes
regress it), and apply durable writes grouped by `(entityId × version-class)` via `guardMany`, bumping
each touched class's token. This is the **CD16 two-version-token cross-write shape** (encounter.version
+ the entity per-class version), NOT CD7's same-class 1+N — atomic because encounters + characters are
tables in ONE Postgres DB. The CLIENT does ONE optimistic pass (request-order-significant, left-to-right
on both sides), advancing each touched token from the action's returned envelope. **R14.4** end-of-turn
Burn/Sleep: the pure producer emits a `CombatantWrite` vitals **intent** (never auto-applied); the DM's
apply feeds it into the batch as a one-element set — no special path.

**Scope fence.** Ship the partition + `guardMany` **shape**; exercise only the MVP batch (all-ephemeral
→ one blob write, OR one durable PC-caster on its existing character path + ephemeral targets). The
**N-durable-rows cross-version arm** (AoE on M PCs) is named-but-unbuilt, gated on the v2 entity table —
do not build the M-row transaction speculatively (durable = PCs only today, CD7).

**Rationale.** A cast is intrinsically multi-component / multi-combatant and can straddle homes;
committing writes separately would strand a half-applied cast on failure and make the optimistic UI lie
(the second write reading a token the first moved — the UNN-226 trap at batch scale). Routing the
engine's own R14.4 obligation through the same batch (a degenerate one-element set) is what makes the
router genuinely general — every mid-combat write flows through one predictable place.

**Adversarial critique resolution.** Re-cited **CD16** (two-version-token cross-write) over CD7's
same-class 1+N (the batch spans the encounters AND characters tables, different token kinds); pinned the
single-session-writer-under-batching rule (all ephemeral writes of one action fold into ONE
`saveEncounterSession`); made N = (entity × version-class) since equipment (deferred) adds an
`inventory`-class bump distinct from a same-entity `vitals` bump.

**Leaning, not Settled** — two open seams: **who PRODUCES** the cast's `CombatantWrite[]` (the
skills/combat fork — CD19/CD20 *consume* the write-set, don't own production), and whether the MVP needs
the batch on day one (vs. single-write `applyCombatantWrite` per DM click). Resolve before wiring
end-to-end.

_PRESERVE:_ CD7a (single-blob-write/single-version), the v1 `guardMany` atomicity, R14.4 (DM applies,
never auto). _SUPERSEDE:_ CD18's single-write framing → the multi-home batch.

---

## Open questions

These are recorded as scope fences and deferred-implementation details, not
blockers. CD1–CD15, CD17, CD18, CD19 are Settled; **CD16 + CD20 are Leaning** (CD16: the
composition wrapper's residency + `endCombat`'s home, Q6/Q7; CD20: the batch's producer seam
+ day-one need, Q12/Q13). The spatial-seam questions (Q6–Q11) are mostly cross-ADR
confirmations the future spatial ADR will close.

1. **View-shaper scope fence (record, not a blocker).** The read-side
   DERIVED-VIEW requirement families — SEL-1..5 (drafting-eligibility selectors),
   NAME-1..5 (display-name + ordinal disambiguation), CON-1..5 / ROS-1..11 (DM
   console + rail/roster shapers), PV-2 (player zone-token shape) — are the SIBLING
   encounter-VIEW fork, NOT this combat-engine ADR. CD9 homes the three view helpers
   that carry deletable F1 kind-branches (initiative/fallen/party-composition);
   CD11/CD12 home redaction + envelope. The remaining view shapers (SEL-4/5
   `sessionIncludesPc`, NAME-1/4 name-by-kind, ROS-2/5/8/9 `isPc` detail-arm, PV-2
   `isPc`) ALSO carry pc-ref kind-branches that MUST become
   ownership/capability/uniform-identity reads (not kind) when that fork lands —
   flagged so neither side assumes the other covers them.

2. **The saver's concrete signature/home** (`R1.5 toCombatantSetup` inverse) is
   RESOLVED in principle (CD3: out-of-band `Map<participantId, StoredEntityLocator>`
   in the impure shell, never on the pure Session) but its concrete shape is
   deferred to the persistence-implementation slice. Confirm `load → reduce → save`
   round-trips the locator faithfully via the out-of-band map, with a contract test.

3. **Free-entered (DM-typed) enemies in v2:** do they author an SP pool (carry
   `skillPool`) or default to catalog-parity (no `skillPool`)? v1's inline
   `EnemyStatBlock` carried `maxSP`/`currentSP`. Decide at authoring-UX time; the
   engine reads presence either way (CD6/CD8), so this does not block the engine.

4. **`defineEnemy` authoring helper vs raw Entity literal per enemy** (CD8) —
   authoring ergonomics, deferred to the catalog port slice.

5. **Boss `turnsPerRound = party size` (D21):** when the deferred multi-turn rules
   land, confirm `turnsPerRound` is layered at snapshot time from
   `session.participants.length` (session-derived), NOT inside the per-entity
   resolve (which has no roster). Substrate-only now (CD10); not a blocker.

6. **CD16 wrapper residency** — ship a literal pure `reduceEncounter(deps)(state,
   event)` engine wrapper (compiler-enforced routing exhaustiveness, pure golden-master
   cross-write atomicity tests, shell shrinks to `load → reduceEncounter → persist`), OR
   a documented shell composition pattern (v1's approach)? The composition CONTRACT is
   settled; the wrapper's existence is the call. **Leaning: ship the wrapper.**

7. **CD16 `endCombat` home** — do the overlay sweep + `pruneCombat` become a pure
   `endCombat` ARM of `reduceEncounter` (testable without a DB) with only the
   status-column flip left to the shell, OR stay shell-composed alongside the flip (v1
   today)? **Leaning: shell-composed today** (the status flip forces a shell write
   regardless); a pure arm is a later refinement.

8. **CD13/CD15/CD16 single-zone permanent contract** (over-constraint flag, NOT asserted
   fine). Committing `Position = { zoneId }` + the single-zoneId equality in
   `zoneEnchantmentEffects` fixes a "one zone per participant for enchantment purposes"
   assumption. A future spatial coordinate/multi-zone model must still surface ONE zoneId
   at the enchantment read. The constraint rides the engine-owned helper's equality
   (CD15), not the component shape, so a multi-zone model updates the helper, not Position
   — but **confirm with the spatial-ADR author** that single-zoneId is an acceptable
   permanent combat-facing contract.

9. **CD16 instance version sharing** — is the instance version token the SAME row the
   spatial ADR will version, or does the combat seam need its own read-only view of it for
   `guardMany`? (`guardMany` needs the token; it need not own it.)

10. **CD17 / spatial game-design** — does combat-end clear the enchantment (v1
    `pruneCombat` clears it) when the SAME Map-Instance continues into exploration after
    the fight, or should a delve enchantment persist? A game-design call the spatial ADR
    may revisit; v1 clears.

11. **Cross-ADR structural guard** — the one-way combat→spatial dependency is currently
    unverifiable (no spatial folder exists in v2; `depcheck.mjs` enforces only
    v1-independence + catalog-port injection, not import direction). When the spatial
    folder lands, add a depcheck/eslint **import-direction rule** (spatial may not import
    `combat`/`encounter`) so the seam is structural, not vigilance — mirroring CD1/CD3/CD14's
    build-time disjointness assertions.

12. **Who produces the cast's `CombatantWrite[]` (CD20)** — is `castSkill(...) → CombatantWrite[]`
    a pure **engine** producer (parity-safe; emits only DM-confirmed intents) or an app-layer
    assembler? This is the **skills/combat fork's seam** (CD8 fenced the enemy-skill home there);
    CD19/CD20 *consume* the write-set, they do not own its production. Must be resolved before the
    batch is wired end-to-end.

13. **Does the MVP need the batch on day one (CD20)** — does a multi-target end-of-turn Burn
    (R14.4 over several afflicted combatants) force `applyCombatantWriteBatch` immediately, or does
    single-write `applyCombatantWrite` (one intent per DM click) suffice for MVP, with the batch
    landing when real multi-write casts do? Also: `setMax`/`adjustExhaustion` pure ops don't exist
    yet — ship them with their writer or scope out of MVP.

### Deferred scope pointer

**Pulled forward (the seam, CD13–CD17):** Position + Engagement as instance-lifecycle
READ components projected into the merged bag; the zone-enchantment read into resolve
(CD15); the `engagedWith` un-stub (CD17); the `reduceEncounter` composition contract
(CD16).

**Still deferred → the future spatial (Tier 3) ADR** (the spatial WRITE / author / derive
side): zone geometry + `reduceMapGeometry`, fog / reveal, connection locks, the movement /
engagement TRANSITION events (`moveCombatant`, set/clear-engagement) + the engagement-graph
WRITE primitives, apply/clear enchantment transitions, the map editor, the dungeon
exploration turn loop (`reduceDungeon`), and field-level (`zoneId → ""`) + fog-gated
redaction (RED-6/7/8/9, all DRD-*). It composes **additively** over the CD12 envelope.
**Parity guards hold:** ranges + opportunity-attacks stay DM-adjudicated (no `validTargets`,
no auto reactions); the combat-SESSION reducer reads / writes NO spatial field (R24.5 — the
only reader of `mapInstanceId` is the `reduceEncounter` root, CD16); the action budget stays
constant (Tarantella prose-deferred).
