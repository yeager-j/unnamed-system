# Engine v2 — Principles-Fidelity Review

**Reviewer mandate:** judge whether the v2 design is faithful to *its own stated
principles* — composition/ECS, functional purity, no god objects, capability- not
kind-discrimination, composition over inheritance, consistent core primitives. This
is **not** a completeness review (others covered requirements). The exemplar of the
class being hunted is the `ResolvedStatblock` god object that D30 fixed: *a thing
can be correct and still betray the design's intent.*

**Verdict up front:** the design is **largely faithful**. D30 was the big one and it's
fixed. The remaining genuine issues are concentrated in a single area — the
**`kind` tags that survived the capability cut** — plus one real soundness smell in
the resolved-vitals span. Most of the things flagged for pressure-testing came back
**sound**. This is a good outcome, not a padded list.

---

## Severity counts

- **betrays-thesis: 2**
- **smell: 3**
- **nit: 2**

**Single most important finding:** *F1 — `Participant.ref` discriminates on
`{kind:"ref"} | {kind:"inline"}`, re-introducing the exact closed `kind` union
(`CombatantRef`) that D1 names as the motivating pain.* It is defensible as a
storage-locator, but the ADR never argues that defense, and as written it is a
nominal branch sitting at the center of the new model.

---

## Genuine violations (ranked, betrays-thesis first)

### F1 — `Participant.ref` is a `{kind:"ref"} | {kind:"inline"}` union — the `CombatantRef` ghost
- **Principle:** Capability- not kind-discrimination (#2); composition (#1).
- **Location:** ADR §2.6 (`Participant.ref`); D29.
- **Severity:** **betrays-thesis** (defensible, but undefended).
- **Why:** D1's *entire stated motivation* is "`CombatantRef` is a closed
  discriminated union keyed on `kind`… the union *is* the type system fighting the
  domain." V2 then reintroduces a closed `kind` union on the participant —
  `{kind:"ref"; entityId} | {kind:"inline"; entity}` — and D29 explicitly says
  consumers must read it (`resolve` composes "regardless of ref kind"). The honest
  defense exists: this `kind` is a **storage-locality** distinction (is the durable
  state on a row or in the blob?), which is a lifecycle fact, not a domain-modeling
  fact — and the ADR's own §2.5/§2.6 thesis is "lifecycle is the legitimate
  organizing axis for storage." But the ADR never *makes* that argument for the ref
  union; it just states the shape. The risk: every read site that pattern-matches
  `ref.kind` to "get the entity" is one nominal branch, and they multiply exactly
  the way `CombatantRef` arms did.
- **Direction (as concrete as D30):** Don't expose `kind` to readers at all. Define
  a single resolver `participantEntity(p, loadById): Entity` that collapses both arms
  to an `Entity` at the boundary — the *one* place the storage distinction is read.
  Everything downstream (`resolve`, the reducer, redaction) takes an `Entity`/
  `Participant` with the entity already attached, and never sees `ref.kind`. Then
  the union is a load-time locator (justified, like `StatProfile.source`), not a
  domain branch. State this explicitly in §2.6 the way D8 states the recipe/flat
  collapse — otherwise it reads as the ghost of the thing v2 exists to kill.

### F2 — Redaction policy `(component, relationship)` cannot express the v1 PC-vs-enemy attribute contract without entity knowledge it claims not to need
- **Principle:** Capability- not kind-discrimination (#2); functional purity of the
  visibility pass (#3).
- **Location:** ADR §2.7 (D20 → D25); cross-checked against
  `requirements/annotated/04-views-redaction-dungeon.md` RED-3/RED-4/DRD-4.
- **Severity:** **betrays-thesis** (this is the one with a security edge).
- **Why:** D20 attaches a visibility policy to the **component type**:
  `(component, viewer/relationship) → keep|drop`. D25 reframes the discriminator
  from `kind` to *Allegiance-relationship*, which is genuinely better for the
  charmed-PC case. **But** the v1 contract being preserved (security-critical,
  D14 flags it) is: `attributes`/`affinities` are PUBLIC on a PC you can see and
  STRUCTURALLY ABSENT on an opposing enemy. Under D25 the discriminator is
  "opposing side ⇒ drop attributes," which *does* reproduce the enemy case — **so
  far so good**. The crack: an **ally NPC** and a **same-side PC** both resolve to
  "same side ⇒ full read," and an **opposing PC (charmed)** resolves to "drop" —
  that is correct and is D25's selling point. The genuine residual problem the
  annotation found is that the policy is keyed on the component *type* alone for the
  decision rule, yet the *value* of that decision depends on the (component,
  relationship) **pair** — which D25 does parameterize. So D25 mostly closes the
  gap the annotation raised against the older D20. **What remains** is narrower but
  real: the policy table is asserted, never written down. There is no enumerated
  `(component × relationship) → {public|drop}` matrix in the ADR, so "is a resolved
  `attack` visible to an opponent?" / "is `vitals.maxHP` visible to a spectator?"
  are unanswerable from the design. For a security-critical, structurally-absent
  contract, an unenumerated policy is itself the violation — it invites a
  per-call-site judgment, which is how the v1 enemy-specific branch crept in.
- **Direction:** Promote the policy to a **single declared table** in the ADR (and a
  single source-of-truth const at build): for each component key, a function
  `relationship → "public" | "drop"`. Make `visibleEntity` a pure fold over that
  table with **no entity argument** — if any component's correct answer turns out to
  need an entity fact beyond Allegiance-relationship, that is the signal D25 is
  under-specified and the fact must be lifted into a component/relationship. Until
  the table is written, F2 is "the security contract is asserted, not specified."

### F3 — Resolved `vitals` and `skillPool` span authored + resolved fields — a mixed-lifecycle component
- **Principle:** No god objects / right granularity (#4); derived-never-stored
  purity (#3); the depletion primitive's uniformity (#6).
- **Location:** D30 (`ResolvedComponentRegistry`: `vitals: {damage, maxHP}`,
  `skillPool: {spSpent, maxSP}`); ADR §2.3.
- **Severity:** **smell** (consistency, not correctness).
- **Why:** D30's stated principle is "two registries: authored/stored vs computed —
  distinct but overlapping." For `vitals` it then bundles an **authored** field
  (`damage`, the stored depletion) with a **resolved** field (`maxHP`, computed) in
  the *resolved* component. That is the one place where the authored↔resolved
  separation D30 just drew is deliberately smeared. It's defensible — `currentHP`
  needs both at the read site, and re-attaching `damage` to the resolved bundle
  saves the consumer a second lookup — but it means a reader of resolved `vitals`
  receives a field it must *not* treat as resolved (writing `maxHP` back is
  meaningless; writing `damage` is the real op). The depletion model (D9/D26) is
  otherwise immaculately uniform; this is the one seam where "resolved" carries a
  stored value.
- **Direction:** Either (a) keep `damage` *out* of resolved `vitals` and let
  consumers that need `currentHP` call a tiny pure `currentHP(authored, resolved)`
  selector (purest — resolved means resolved), or (b) document explicitly in D30 that
  resolved `vitals`/`skillPool`/`Resources` are the *one* deliberate authored∪resolved
  read-bundle and name *why* (currentHP/currentSP/current-pool are the universal read
  unit), so the smear is a named exception, not an accident. Pick (b) if the selector
  churn isn't worth it — but say so.

### F4 — `Presentation.kind: "pc"|"enemy"|"npc"|"object"` keeps a four-arm provenance union the model claims to have dissolved
- **Principle:** Capability- not kind-discrimination (#2).
- **Location:** O1 catalog (`Presentation`); ADR §2.7; D7.
- **Severity:** **smell.**
- **Why:** D7 is emphatic that `kind` "controls nothing structural… survives only as
  cosmetic metadata, if at all." Yet O1 ships a first-class `Presentation` component
  carrying the *exact* four-arm union (`pc|enemy|npc|object`) that is the
  provenance dimension D1 set out to delete, and the annotated requirements show
  multiple view-shapers reaching for it ("`isPc` becomes has-the-PC-presentation",
  party-composition "pc-ref check becomes a capability/Presentation check"). The
  moment a view-shaper branches `presentation.kind === "pc"`, the cosmetic tag is
  load-bearing again — and "is this a PC" is being asked as a `kind` question when
  the design says it should be a capability question (does it carry the PC identity
  capability / is it owned-by-a-player). The ADR even contradicts itself: D11's
  storage table has an `entity.kind: "pc"|"npc"` *column* (justified — durable
  lifecycle), but O1 *also* puts a wider `kind` in a *component*. Two homes for the
  same nominal tag, one cosmetic and one load-bearing-by-accident.
- **Direction:** Split the concerns. (1) Keep the **durable lifecycle** `kind` as the
  D11 column (`pc|npc`) — that's a legitimate storage/queryability fact. (2) Demote
  `Presentation` to *genuinely* cosmetic: `{ portraitUrl?; label? }`, **no `kind`**.
  (3) For every view-shaper that currently wants `kind === "pc"`, define the real
  predicate it needs as a capability (`isOwnedByPlayer`, `hasPlayerIdentity`) or read
  the D11 column once at the load boundary — never branch on a component `kind`. If
  after that exercise some shaper *still* needs `enemy`/`object`, that's the signal
  the capability model has a genuine gap to name, not a tag to keep.

### F5 — `Resources` bundles four pools — cohesive, but worth a one-line "why these four"
- **Principle:** No god objects / right granularity (#4).
- **Location:** O1/D26 (`Resources {hitDiceUsed, skillDiceUsed, prismaUsed, exhaustion}`).
- **Severity:** **nit** (examined, leaning sound — flagged for one stated reason).
- **Why:** The granularity rule is "smallest cluster a single system reads/writes
  together." Three of the four (`hitDiceUsed`, `skillDiceUsed`, `prismaUsed`) are the
  uniform depletion model and clearly co-resolve. `exhaustion` is the odd one: D27
  makes it **durable level with table-derived effects**, a different read/write
  cadence (rest mechanics, not pool spend) and a different shape (a level 0–6, not a
  `used` counter). Bundling it with the spend-pools is the mild smell — it's in the
  bag because it's also "durable + derived-effects," not because the same system
  reads it with the dice. This is *not* a god object (four small scalars), so it's a
  nit; but the bundle's cohesion is asserted, not justified.
- **Direction:** Either keep it and add one sentence to D26/D27 naming the cohesion
  ("all derivable-max or table-derived durable pools, read at rest/resolve"), or split
  `exhaustion` to its own tiny component if a system ever reads it without the dice.
  Don't pre-split; just state the rationale so the next person doesn't cargo-cult
  "throw durable scalars in Resources."

### F6 — `guard` factory trusts an unverified predicate — acceptable, but the trust isn't localized as claimed
- **Principle:** Functional purity / soundness (#3); consistency of primitives (#6).
- **Location:** ADR §2.1; D16.
- **Severity:** **nit** (examined, judged *sound* — minor caveat).
- **Why:** D16 is candid: "TS does not verify a predicate body, so `guard` is
  trusted." The mitigation is strong — `Has<K>` and the `every(k => …!== undefined)`
  check both derive from the *same* `K`, so the unsoundness can't drift the way a
  hand-written `e is Foo` returning a mismatched body would. This is the right
  trade and is well-argued. The one caveat to the "trust is one line" claim: the
  predicate also trusts that a *present* component key holds a value of the *correct
  shape* (jsonb-loaded). `components.vitals !== undefined` proves presence, not that
  it's a valid `Vitals`. D4 says the guard layer is "how a jsonb-loaded entity is
  narrowed at runtime" — but presence-narrowing is not shape-validation. If a
  malformed blob has `vitals: {}`, the guard passes and a downstream `damage` read is
  `undefined`.
- **Direction:** Keep the factory exactly as designed (it's correct for its job).
  Add one sentence to D16/D4 clarifying the boundary: **presence** is guarded;
  **shape** is the Zod-per-component decode at the load/projection seam (D11), not the
  guard. As long as every jsonb→Entity projection runs the component Zod schemas
  (which D3/D11 imply but don't pin to the guard discussion), the trust is sound.
  This is documentation, not a redesign.

---

## Examined and cleared (sound under the principles)

These were pressure-tested per the mandate and judged faithful — listed because
"examined, justified" is signal.

- **`StatProfile` as the authored swap-bundle (D8) — SOUND.** The suspicion was that
  `{attributes, maxHP, maxSP, affinities, skills}` is a god object on the *authoring*
  side, the mirror of the `ResolvedStatblock` sin. It isn't: D8's "authoring
  granularity ≠ read granularity" is a real and correct distinction. These fields are
  *swapped together atomically* by a form (the whole point of Shapechanger/Nyx), so
  the cluster that's *written together* genuinely is this bundle — that's exactly the
  granularity rule ("smallest cluster a single system writes together"), and the form
  swap *is* the single system. Critically, D13's boundary test (`level` must NOT be
  in it because it survives a form swap) proves the bundle's edges were drawn by a
  principle, not convenience. This is the *correct* dual of D30, not a hidden god
  object.

- **`resolve` as a one-pass fold exposed per-capability (D30/§2.3) — SOUND.** The
  "compute-once, expose-narrowly" framing is exactly right: cross-cutting computation
  with a composable interface, no per-consumer coupling, no runtime cost. This is the
  D30 fix landing cleanly.

- **Purity / no mutation — SOUND.** The engine functions are declared pure
  `(entity)→entity`, `(session, event)→session`, derived-never-stored. Nothing in
  the v2 design relies on shared state or non-determinism. The repo's Immer
  convention (per memory: Immer for nested reducers, hand-roll the flat character
  patch) is a faithful *implementation* detail and doesn't break the pure-function
  contract (Immer preserves the same-ref no-op contract). No betrayal here.

- **`entity.kind: "pc"|"npc"` column (D11/D13) — SOUND** (distinct from F4). As a
  *durable-storage/queryability* column it is a legitimate lifecycle fact (list/place
  NPCs with SQL; nullable `level`), explicitly **not** a domain-logic branch. The
  violation is only when the *component* `Presentation.kind` duplicates and widens it
  (F4) — the column itself is fine.

- **The overlay bundle on `Participant` (Allegiance/TurnState/Ailments/
  BattleConditions/Counters) — SOUND.** Not a god object: it's the set of components
  sharing one lifecycle (encounter-scoped, cleared at combat end by the same sweep)
  and one storage home (the session blob). They are bundled by a *shared lifecycle +
  shared clear-trigger*, which is precisely the O1 granularity axis. Each is still an
  independently-narrowable component; the "overlay" is a grouping label, not a fat
  type a consumer must take whole.

- **Session as a container, not an entity (D29) — SOUND.** Correctly refuses to make
  the encounter an entity; keeps the reducer pure with no `edits[]` decider (the
  architecture report corrected that premise). The vitals-placement-follows-lifecycle
  call is the honest consequence of the storage split, not a special-case.

- **Snapshot envelope / two registries (authored vs resolved) — SOUND.** The two
  `ComponentRegistry`s are the legitimate authored↔computed separation D30 introduced;
  they share the guard factory. Not a god object, not a kind-leak. (The one seam is
  F3's vitals span.)

- **Depletion primitive (signed `damage`, `used`/`spent`, operation-owned clamps) —
  SOUND and notably consistent.** D9/D10/D26 apply the *same* model to HP/SP/dice/
  Prisma with per-operation bounds (strict-`>` HP, `>=` SP preserved from v1). This is
  the most uniformly-applied core primitive in the design — over-max HP as negative
  damage is an elegant non-special-case. No betrayal.

- **D20/D25 visibility staying capability-pure — MOSTLY SOUND.** D25's reframe from
  `kind` to Allegiance-relationship is a genuine capability/relationship move and is
  *better* than v1. The residual is F2 (the policy table is unenumerated), not the
  keying axis. The axis itself is faithful.

- **Mechanics as a capability any entity carries (D8/D17) — SOUND.** This is the
  thesis working: enemies/NPCs holding Mechanics with zero new union arms, the
  registry carved out as engine-owned behavior (correctly *not* a data port).

---

## Summary for the caller

The v2 design is **faithful to its own principles** with two genuine
betrays-thesis findings, both in the "kind tags that survived the cut" family:

1. **F1 (most important)** — `Participant.ref`'s `{kind:"ref"}|{kind:"inline"}` union
   is the `CombatantRef` ghost. Defensible as a load-time storage locator, but the
   ADR never makes that argument and lets readers branch on `ref.kind`. Fix: collapse
   both arms to an `Entity` at one boundary resolver; never expose `kind` downstream.
2. **F2** — the redaction policy is asserted but never enumerated; for a
   security-critical structural-absence contract, an unwritten `(component ×
   relationship)` table is itself the violation. Fix: declare the table as one
   source of truth, `visibleEntity` a pure fold over it with no entity argument.

Then **F3** (resolved `vitals` smears authored `damage` into a "resolved" bundle —
name it or split it), **F4** (`Presentation.kind` re-ships the 4-arm provenance union
D7 says is cosmetic; demote it to portrait/label and route "is-PC" through a
capability), **F5/F6** nits (Resources cohesion + guard presence-vs-shape — both
sound, want one clarifying sentence each).

Everything else pressure-tested came back clean: `StatProfile` is the correct dual of
D30 (not a god object), the one-pass fold, the depletion primitive, the overlay
bundle, the Session container, the two registries, purity, and Mechanics-as-capability
are all faithful. **The single most important fix is F1.**
