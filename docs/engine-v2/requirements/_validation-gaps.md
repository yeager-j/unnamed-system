# Validation: does the design account for every requirement?

Six validators classified all ~440 inventory requirements PRESERVE / SUPERSEDE /
GAP against the decision log (D1–D23 + O1). Per-file annotations live in
`annotated/`. **No requirement is a *rule* contradiction** — every gap is "the new
model has no home for this" or "the new model can't express this." This report
consolidates the gaps by **severity**, where severity = *does the new model need a
decision, or does the rule just carry over and get re-homed during the build?*

Key framing: the log is a **data-model + departures ADR**, not a full engine spec.
"Design-silent on a v1 algorithm" is expected and fine **when the algorithm
carries over cleanly** onto components (Tier 2 below). The real findings are the
places where the new model is **insufficient** (Tier 1).

---

## Tier 1 — Model gaps: need a decision before building

These are not carry-over; the new model as written can't express them or leaves a
correctness/security question open.

### T1.1 — D20 visibility is under-powered (SECURITY) · from `04`
D20's policy is per-component-**type** `(component, viewer)`. The real v1 redaction
needs more, and D7 deliberately demoted the discriminator v1 uses (`kind`):
- **Entity-conditional:** `attributes`/`affinities` are *public on a PC*, *structurally
  absent on an enemy* — same component, different visibility by provenance.
- **Field-level / conditional-blank:** `zoneId → ""`, far `toZoneId` stripped — D20
  only drops whole keys.
- **Fog-/mode-gated:** delve-only redaction; D20 is static (documented attack: poll
  the public encounter snapshot mid-dungeon-fight).
- **Envelope projection:** the snapshot top-level whitelist + currentActor subset +
  dungeon `turn`-only is outside D20's per-entity scope.
**Fix direction:** make the policy `(component, viewer, entity)`, add field-level +
fog-gated stages, and a snapshot-envelope projector above `visibleEntity`.

### T1.2 — O1 has no home for durable character resources · from `01`, `05`
Vitals (`damage`) and SkillPool (`spSpent`) cover HP/SP only. No component for:
**Hit Dice / Skill Dice remaining**, **prismaCharges**, **currency**, **manualBonuses**
(a stat-bonus source-family, not a child table). These are durable, non-combat,
and fall through O1's combatant-centric catalog.
**Fix direction:** a durable **Resources** / **Progression** component family (or
explicit D11 columns for scalars). Small but blocking.

### T1.3 — Exhaustion: durable vs overlay (CORRECTNESS) · from `01`, `05`
Exhaustion **persists on the character**, but D8 says the combat overlay is
*cleared at end of combat*. If modeled as overlay it gets wrongly wiped; D13 says
it can't live in StatProfile (survives form swap), and Vitals is `damage`-only.
**Fix direction:** classify exhaustion as a durable resource (T1.2 family); audit
which O1 components are overlay (cleared) vs durable.

### T1.4 — No session-level container · from `03`
O1 is entirely per-entity. The encounter session fields `round`,
`currentActorId`, `advantage`, `firstSide` have no home — an encounter is not just
a bag of entities.
**Fix direction:** a session/encounter-state shape alongside the entity set
(v1 had `CombatSession`); decide its v2 form.

### T1.5 — Engagement is not a modeled component · from `03`, `04`
The symmetric melee-lock graph (set/clear/diff/break-on-move) underpins both combat
rules and a redaction rule (D20 must be able to *drop* `engagedWith`). O1 only says
Position "may live on the map token."
**Fix direction:** model engagement explicitly (component or session-level graph).

### T1.6 — Catalog-enemy dedup under D11 · from `02`, `03`
v1 resolves an enemy statblock **once per `enemyKey`** and shares it. D11's
per-instance entity model doesn't obviously preserve that dedup, and `getEnemy`
resolution likely moves from the reducer to the load-projection boundary.
**Fix direction:** confirm where catalog resolution happens and that dedup survives.

---

## Tier 2 — Carry-over algorithms: re-home during the build (no model change)

These are PRESERVE rules that don't change; they were never in the log because
they're not novel. Each needs a v2 home that consumes `resolve(entity)` +
components instead of `HydratedCharacter`, enforced by the D15 parity tests. Risk
is execution, not design.

- **Resolver pipelines** (`02`): attack-roll resolution (contributor order, sources,
  labels), damage-bonus resolution, and the zone-enchantment → attack-roll context
  channel (how Bard/Toccata reach a roll). D8 declares the *output fields*, not the
  resolvers.
- **Turn-loop bookkeeping** (`03`): initiative tiebreak chain (Agility→Luck→d20);
  `hasActedThisRound`→`turnsTakenThisRound` successor; wiring D21's turn-start budget
  snapshot to the draft event.
- **Duration / tick arithmetic** (`03`): battle-condition end-of-turn decrement +
  auto-expiry-to-neutral; ailment Burn/Sleep HP tick (`floor(maxHP*10/100)`). O1
  says "durations tick down" but the arithmetic is unhomed. *(Note: D18 is about
  resolve-layer stat stacking, NOT condition clocks — don't conflate.)*
- **Item-mutation engine** (`05`): equip single-slot swap, top-up-then-overflow
  stacking, `setItemQuantity` clamp/drop, the mutation router + error unions. D10's
  "operations own clamps" is written for HP and must extend here.
- **Inventory display resolution** (`05`): `resolveInventory` grouping/sort/equipped.
- **Lineage Atlas** (`06`): `buildLineageAtlas` / `getAtlasRecommendations` —
  a progression projection over catalog + owned rows; **not** derivable off
  `ResolvedStatblock`. Inputs re-home cleanly; the builder logic needs a home.
- **Inheritance slot-validity** (`06`): D19 homes the data + form pass-through but is
  silent on `isInheritableSkill` rank-gate, stale-slot surfacing, source grouping.
- **View-shaper layer** (`02`, `04`): console/roster/zone-layout/selectors/
  party-composition — D7 covers widgets, not the engine-side shaping helpers.
- **`createGameEngine` v2 method set** (`06`): D23 sketches the composition root but
  never enumerates the bound surface.

---

## Tier 3 — Deferred subsystem

### T3.1 — Map-Instance spatial layer · from `03`, `04`, `06`
Zone geometry, token movement, fog/reveal, connection locks, Zone-Enchantment
*state*, occupancy primitives, zone-graph queries, the two-reducer split, and the
`reduceMapGeometry` template reducer (lowest-free-slot naming, same-ref no-op) are
**entirely unaddressed** by the log. ~30+ PRESERVE reqs hang off this. It's a large,
self-contained subsystem (the spatial M2 layer) — best treated as **its own epic**,
designed after the core entity/combat engine lands, not crammed into this ADR.

---

## Meta

The model designed the **entity / resolve / vitals / visibility** half thoroughly
and it cleanly supersedes v1's `kind`-leaks. The validation's value was exposing
that (a) a few model pieces are genuinely missing (Tier 1 — durable resources,
session container, engagement, and a more expressive visibility model), and (b)
the entire **behavioral/algorithmic half** is carry-over that needs explicit
re-homing (Tier 2), plus (c) the spatial subsystem is a separate epic (Tier 3).
None of it invalidates D1–D23; it scopes the work that remains.
