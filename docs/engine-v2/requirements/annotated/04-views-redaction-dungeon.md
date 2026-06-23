# Annotated — Views, Redaction & Dungeon Turn Loop (04)

Each v1 requirement classified against the v2 decision log (D1–D23, O1).

- **PRESERVE** — v2 must reproduce the behavior exactly; cites the decision(s)/component(s) that account for it.
- **SUPERSEDE** — a decision deliberately changes the behavior; cites the D-number.
- **GAP** — the design is silent or cannot express it.

Recurring structural note: all the **view/selector shapers** (SEL, NAME, CON, ROS, ENG, ZG, ZL, ZX, PV, party-composition) are v1 *read-side projections* over the participant union. The decision log's headline move (D1/D7/D20) is that participants become capability-composed entities and rendering/redaction become uniform per-component passes. None of the individual view-shaper functions has an explicit home in D1–D23 or the O1 catalog — the log addresses the *participant model* and the *visibility filter* but never enumerates the encounter/dungeon **view-shaper layer** (`console-view`, `roster-view`, `resolve-zone-layout`, `resolve-engagement`, `resolve-reveal`, `resolve-zone-exits`, `setup-roster-view`, `party-composition`) as a thing v2 carries over. They are PRESERVE-by-default (D2 "carry over v1's wins") but the catalog never names them — see the GAP roll-up at the bottom for the view-shaper-layer omission and the per-requirement details that are genuinely inexpressible.

---

## Turn-order selectors

**SEL-1 — Pending combatants.** PRESERVE. Drafting eligibility logic; D2 carry-over of the encounter tracker selectors. The `fallenIds`/`hasActedThisRound` inputs map onto Vitals (D9, Fallen = `damage ≥ maxHP`) + TurnState (O1 `turnsTakenThisRound`). No decision changes the rule. **The selector function itself has no named home** — see view-shaper GAP.

**SEL-2 — Next drafting side fully derived.** PRESERVE. Pure derivation (lead side, advantage round-1, alternation). D2 carry-over. Inputs (`firstSide`, `advantage`, per-combatant acted flags) are session-level, not entity components — not addressed by any D. Notes: no decision touches drafting-side logic; it must be reproduced verbatim. Home unnamed.

**SEL-3 — Eligible combatants.** PRESERVE. Composition of SEL-1 + SEL-2. D2. Revive re-appears (Fallen recomputed) aligns with D9 depletion (Fallen derived from `damage` vs resolved maxHP). Home unnamed.

**SEL-4 — Session-includes-PC lock predicate.** PRESERVE *(with a representation shift)*. Matches a `pc` ref by `characterId`. Under D11, a PC combatant is an entity projected from a durable `entity` row; "is this character in the session" becomes "is there an entity in the session whose durable id is X." The *behavior* is preserved; the `pc`/`enemy`/`catalog-enemy` ref union it currently switches on is SUPERSEDED by D1 (components, no `kind` branch). Flag: the requirement is keyed on a `characterId` that lives on the `pc` ref arm; v2 needs the entity↔character-row identity link (D11 durable id) to reproduce it. Accounted for by D11 but **not spelled out** — minor GAP on identity mapping.

**SEL-5 — PC combatant character ids.** PRESERVE (same identity-mapping caveat as SEL-4). The "skip enemy/catalog-enemy" filter becomes "entities with a durable PC identity," D1/D11.

---

## Fallen derivation

**FAL-1 — Fallen recomputed from current HP per kind.** PRESERVE (core rule) + SUPERSEDE (the per-kind HP plumbing). The rule "Fallen = hp ≤ 0, recomputed fresh, revive needs no event" is exactly D9 (`currentHP = max(0, maxHP − damage)`, "fallen is `damage ≥ maxHP`", clamp-only, no reconciliation). The three-way HP sourcing (`pcCurrentHpById` vs inline `statBlock.currentHP` vs `catalog-enemy ref.currentHP` defaulting to definition maxHP) is SUPERSEDED by D8/D9 — one uniform `resolve(entity)` yields maxHP, Vitals holds `damage`, currentHP is derived identically for every entity. The "PC missing from map ⇒ not Fallen" and "catalog def unresolvable ⇒ 0" defaults are edge behaviors that the uniform resolve must still reproduce; D8/D9 cover the happy path but the **missing-input defaults are not specified** — minor note.

---

## Name disambiguation

**NAME-1 — Base combatant name from ref.** PRESERVE + SUPERSEDE (per-kind switch). Name resolution is universal — Identity component (O1 `{ id; name }`, "Every entity"). The three-arm `kind` switch (pcInfoById / statBlock.name / enemyStatblockById) is SUPERSEDED by D1/D7: name comes from one `Identity.name`, no branch. Fallback-to-raw-id is an edge the Identity read must keep. PRESERVE the never-blank guarantee.

**NAME-2 — Ordinal suffix for duplicates.** PRESERVE. Pure string/ordering helper over a name list; provenance-neutral already. D2 carry-over. No component needed beyond Identity. Home unnamed.

**NAME-3 — Live display-name map keyed by combatant id.** PRESERVE. "The single home all live surfaces route through" — this is a shared selector. D2. Important: the requirement asserts a *single* numbering authority so rail/drawer/battlefield/snapshots can't drift; v2 must keep one such function. **No decision names it**; the redaction passes (D20) and the view shapers all consume disambiguated names, so v2 needs this shared shaper to feed both the DM views and the redacted snapshots — see GAP roll-up (numbering-authority must sit *before* redaction so the DRD-4/NAME-3 "consistent with DM rail" guarantee holds).

**NAME-4 — Setup roster base name.** PRESERVE + SUPERSEDE (per-kind switch, as NAME-1). Setup-phase peer; Identity-based. Home unnamed (setup-roster-view layer).

**NAME-5 — Setup labels carry numbering into the fight.** PRESERVE. Number derived not persisted; survives setup→live. D2. Catalog-enemy "stores no per-instance name" — under D1 an ephemeral enemy instance entity carries its own Identity, so numbering is still derived from order. Home unnamed.

---

## Console view (DM turn-order spine)

**CON-1 — Console view assembles rows + actor + drafting side + round-complete.** PRESERVE. The DM turn-order spine view. "Pure, recomputed on every optimistic session change" matches D6/D9's pure-derivation discipline. **View-shaper home unnamed** — `buildConsoleView` is exactly the kind of per-surface read-shaper that D7 says becomes "capability→widget + layout preset," but the *data-assembly* function (rows/actor/side) is not the widget map; it's a selector with no catalog entry.

**CON-2 — Per-combatant row flags.** PRESERVE. `hasActed`/`isCurrent`/`isFallen`/`isEligible` derive from TurnState (O1), currentActorId (session), Vitals/D9, and SEL-3. `name` falls back to id (Identity). No decision changes the flag set. Home unnamed.

**CON-3 — Only Fallen excluded; Downed stays eligible.** PRESERVE. Critical rule: Downed (an ailment) is NOT a drafting exclusion; only Fallen (HP-derived, D9) is. Downed lives in the Ailments overlay component (O1); Fallen derives from Vitals. The two-source distinction is preserved structurally (Ailments ≠ Vitals). **No decision discusses the Downed-vs-Fallen draft semantics explicitly** — it falls out of keeping Ailments and Vitals as separate components, but is unstated; flag as a behavior to pin in tests (D15).

**CON-4 — Current actor view or null.** PRESERVE. `currentActorId` is session turn bookkeeping (D5 scope guard: "turn bookkeeping is always literal state," not derivable). `hasActed` distinguishes active turn from end-of-turn beat. Home unnamed.

**CON-5 — Drafting side + round-complete flag.** PRESERVE. `roundComplete = eligibleIds.size === 0`, composes SEL-2/SEL-3. Home unnamed.

---

## Rail / roster view (DM rail + drawer)

**ROS-1 — Roster grouped by side with enemy rollup.** PRESERVE + partial SUPERSEDE. Grouping by `side` is Allegiance (O1). `downedEnemyCount` counts enemy rows with the `downed` ailment (Ailments overlay). "Enemy rollup" assumes an enemy *kind* — under D1 "enemy" is `Presentation.kind` cosmetic (O1, "not load-bearing") OR an Allegiance side; the rollup must re-express "enemy" as side/allegiance, not kind. Behavior preserved, kind-keying superseded (D7). Home unnamed (roster-view layer).

**ROS-2 — Rail row shape + token-source split.** PRESERVE + SUPERSEDE. The row fields map to components: `hp`/`sp` (Vitals/SkillPool + D9 resolve), `engagement` (Engagement/occupancy), `zoneName` (Position, O1), `reactionAvailable` (TurnState, D21), `counters` (Counters). **`isPc` "keyed to ref *kind*"** and "`portraitUrl` always null for enemies / `sp` null for enemies" are SUPERSEDED by D7: presence-of-capability, not kind. A charmed PC "keeps PC token + SP" is exactly D7's example (Allegiance ≠ kind; SP is SkillPool presence). v2: `isPc` becomes "has the PC identity/presentation"; `sp` null becomes "no SkillPool component"; portrait becomes a Presentation/Identity field present-or-not. PRESERVE the rendered result, supersede the kind switch.

**ROS-3 — Rail zone display name, never raw id.** PRESERVE. Position (O1) + zone-name resolution; null on unplaced/stale. Home unnamed.

**ROS-4 — PC pool resolution with safe default.** PRESERVE + SUPERSEDE. PC HP/SP pools from injected detail with `{0,0}` default. Under D8/D9/D11 the PC entity carries Vitals + resolved maxHP directly — the "inject pcDetailById" indirection (the v1 split where PC vitals live off-session) is SUPERSEDED by the entity carrying its own components. `{0,0}` missing-detail default must survive as a defensive edge.

**ROS-5 — Enemy HP + catalog working-HP default.** PRESERVE (rule) + SUPERSEDE (per-kind plumbing). "Catalog enemy renders at full HP until working HP set" / "definition unresolvable ⇒ 0" — under D11 an ephemeral enemy instance is a component blob projected from the catalog definition; maxHP resolves via D8, `damage` defaults to 0 (= full HP) via D9. The inline-`statBlock` vs `catalog-enemy ref.currentHP` fork is SUPERSEDED (D1/D9). The "definition unresolvable ⇒ 0" default is an edge to preserve.

**ROS-6 — Combatant detail (drawer) or null.** PRESERVE. Per-id lookup; null on absent. Home unnamed.

**ROS-7 — Detail shared overlay (PC + enemy identical).** PRESERVE — strongly validated by v2. `ailments`/`battleConditions`/`conditionDurations`/`actionEconomy`/`counters` read identically for both kinds — this is *precisely* the D1/D7 thesis (same components ⇒ same rendering, no kind branch). Components: Ailments, BattleConditions+ConditionDurations, TurnState (action economy = available = resolved−used, D21), Counters (O1). The "identical shape for PCs and enemies" is the capability model's reason for existing.

**ROS-8 — PC detail arm.** PRESERVE + SUPERSEDE. Field list (level/className/pronouns/portrait/hp/sp/attributes/affinities/skills) maps to entity column `level` (D13) + Identity/Presentation + Vitals/SkillPool + resolved attributes/affinities/skills (D8 `ResolvedStatblock`). **`vitalsVersion`** is the standout: ROS-8 carries a per-surface `vitalsVersion` token, which D12 deliberately COLLAPSES to a single `version`. SUPERSEDE via D12 (Leaning — note D12 is not Settled). The "missing detail defaults" (level 1, attributes all-zero, etc.) are edges to preserve. The `kind:"pc"` arm tag is cosmetic (D7/Presentation).

**ROS-9 — Enemy detail arm.** PRESERVE (resolved-statblock content) + SUPERSEDE (arm/kind structure). The catalog-enemy "resolved `Statblock`" and inline-enemy "provisional statblock" are unified by D8's `ResolvedStatblock` computed by one `resolve` for any entity — this directly fulfills the v2 premise (the `Statblock` projection becomes the resolve output). The two arms (catalog vs inline) collapse to one resolve path; the `kind:"enemy"` tag is cosmetic. PRESERVE the field shape + zero/minimal fallbacks; supersede the dual derivation.

**ROS-10 — Detail position (move control).** PRESERVE. `position` = current zone + movable targets; null when no zones; "unplaced ⇒ all zones; current never in targets." Position component (O1) + zone-graph (ZG-2). Home unnamed; logic preserved verbatim.

**ROS-11 — Detail engagement.** PRESERVE. Delegates to resolve-engagement (ENG-1). Engagement component/occupancy token. Home unnamed.

---

## Engagement resolution

**ENG-1 — Combatant engagement shape `{value,targetNames,candidates}`.** PRESERVE. Engagement state (O1 Position/occupancy region; v1 homes engagement on the map token). "Candidates = others sharing zoneId plus current targets (so a stale link is clearable)" is a precise rule to preserve. **Engagement has no dedicated O1 component** — it's mentioned as living "on the map token" (Position note), but the `{ engagement }` holder, the symmetric melee-lock graph, and these resolvers are not in the catalog. Flag as a missing component (see GAP roll-up: Engagement component).

**ENG-2 — Same-zone engageable targets (setup).** PRESERVE. Setup-phase; same-zone, side-agnostic. Position + setup roster. Home unnamed.

**ENG-3 — Mutual (symmetric) engagement set.** PRESERVE. Symmetric mirroring onto targets, revert to Free when no links. This is a non-trivial graph-mutation rule. **No decision models symmetric engagement** — D21 covers action economy, not engagement; O1's only nod is "Position may live on the map token." Engagement-as-symmetric-graph is a GAP in the component catalog (the behavior must exist; the home is unnamed).

**ENG-4 — Normalize engagements (drop cross-zone/missing).** PRESERVE. "Must be re-run after any placement/roster change"; unzoned ⇒ untouched; symmetric. Same missing-home note as ENG-3.

**ENG-5 — Engagement-holder primitives (graph ops).** PRESERVE. `engagedWith`/`setEngaged`/`unlink` operate in-place on any `{ engagement }` holder (combatant OR map token), Immer drafts. This is the shared primitive layer; reinforces that Engagement is a real component v2 must define (GAP roll-up). Immer-in-place aligns with the reducer style memory but the engagement graph isn't in any reducer decision.

**ENG-6 — Engagement clustering (connected components).** PRESERVE. Partition zone tokens into connected components of the symmetric lock graph; precise edge rules (self-link no edge, redacted-partner reachable through own edge, chains merge). Pure graph algorithm; D2 carry-over. **Redaction-aware**: "a token reaches a partner through its *own* edge even if the partner's engagement is absent (redacted)" — this couples clustering to D20's per-component redaction (a redacted Engagement component still leaves the holder's own edge). v2 must ensure D20 drops the *partner's* engagement but clustering still works from the holder side. Flag: D20 can express "drop the engagement component on opponents," but the clustering robustness to one-sided edges is a behavior to preserve, not something D20 states.

---

## Zone graph

**ZG-1 — Adjacent zones.** PRESERVE. Pure graph over instance geometry; undefined-safe; no self-adjacency. Geometry is Map Instance state, not an entity component. D2. **Map/zone geometry has no home in D1–D23/O1** — the decision log is entity-centric and never addresses the Map Instance geometry/connection model the dungeon + encounter spatial layers depend on. See GAP roll-up (geometry/zone-graph layer).

**ZG-2 — Movable zones for a combatant.** PRESERVE. `anywhere` flag, off-graph ⇒ all zones, acting zone excluded. Position + geometry. Same geometry-home GAP.

**ZG-3 — Adjacency map (wire shape).** PRESERVE. Undirected `zoneId → neighbors`, dedupe, no leaked connection flags. Feeds the snapshot `adjacency` (RED-1/RED-9). Same geometry-home GAP.

---

## Zone layout (DM battlefield)

**ZL-1 — Zone layout view `{zones,unplaced,hasZones}`.** PRESERVE. Geometry insertion order; `unplaced` = stale/empty zoneId; referential integrity not enforced. Geometry + Position. Home unnamed; geometry GAP.

**ZL-2 — Zone entry.** PRESERVE. Per-zone shape (adjacentZoneNames, combatants, enchantment, engaged). Geometry GAP.

**ZL-3 — Zone token.** PRESERVE + SUPERSEDE (PC/enemy kind split). Token name = disambiguated label (NAME-3), PC ⇒ portrait+pcPool, enemy ⇒ null portrait/SP. The PC/enemy fork is the same kind→capability supersede (D7). "DM shaper always sets engagement (`{free}` default)" contrasts with PV (player omits engagement) — relevant to redaction (D20 drops engagement for the player). PRESERVE result.

**ZL-4 — Zone reads Engaged when both sides occupy.** PRESERVE. `engaged` = ≥1 players token AND ≥1 enemies token, derived from token Allegiance sides. Used by both DM + player layouts. Allegiance component. Home unnamed.

**ZL-5 — Enchantment badge.** PRESERVE. Zone-enchantment badge `{type,name,forte,marking,lines}`, forte lines active at-or-below current. Enchantment is session/instance state (the zone-enchantment singleton), not an entity component. **Zone enchantment has no home in O1** — it's neither an entity component nor named in any D; it's instance-level state the view shapers read. GAP roll-up (zone-enchantment model). Shared DM+player.

---

## Zone exits (DM run console)

**ZX-1 — Zone exits.** PRESERVE. Per-connection `{connection,neighborName,neighborRevealed,hiddenFromPlayers,locked}`; `hiddenFromPlayers = fog stripped AND authored hidden`; `locked` per REV-2. Combines geometry + reveal/fog + lock overlay. **Fog/reveal + connection-lock model has no home in D1–D23/O1.** The dungeon fog state (revealedZoneIds, revealedConnectionIds, unlockedConnectionIds, three-state fog) is entirely a Map Instance / Dungeon concern the decision log never models. Major GAP — see roll-up (reveal/fog/lock layer).

---

## Reveal / fog primitives

**REV-1 — Zone revealed predicate.** PRESERVE. `revealedZoneIds` membership. **No home** (fog GAP).

**REV-2 — Effective connection lock.** PRESERVE. Authored locked unless runtime-unlocked. Fog/lock GAP.

**REV-3 — Fog-active predicate (delve vs standalone).** PRESERVE. `isFogActive = revealedZoneIds.length > 0` — THE gate deciding whether the encounter snapshot fog-redacts (RED-8). Security-relevant. Fog GAP; and it directly feeds D20-adjacent redaction (see RED-8). D20 has no concept of a *conditional* (fog-gated) redaction trigger — flag.

**REV-4 — Three-state connection fog (revealed/known-exit/stripped).** PRESERVE. Hidden ⇒ stripped until revealed; endpoint-count rule. Fog GAP. Drives DRD-5/6/7 silhouette redaction.

**REV-5 — Reveal view of an instance.** PRESERVE. `{revealedZoneIds, connections{connection,state,locked}}`. Fog GAP.

---

## Player view battlefield (encounter watch)

**PV-1 — Player zone layout from snapshot.** PRESERVE. Same `ZoneLayoutView` as DM, from the *redacted* snapshot. This is the consumer side of D20's output — the redacted snapshot is reshaped client/engine-side. Confirms the view-shaper layer (player + DM share `ZoneLayoutView`). Home unnamed; geometry GAP.

**PV-2 — Player zone token.** PRESERVE. `engagement deliberately omitted` (snapshot carries no Engagement) — this is exactly D20 dropping the Engagement component for the player viewer. PRESERVE result; D20 accounts for the omission, but only if Engagement is a redactable *component* (see ENG GAP — it must be modeled as a component for D20 to drop it). HP/SP per redacted arm (enemy no SP).

---

## Redaction — encounter player snapshot (security-critical)

D20 model: `visibleEntity(entity, viewer)`, each component declares a visibility policy (public / owner+dm / dm-only); redaction drops the whole component **key** (structurally absent, not nulled). Assessment per requirement — **can D20 express the exact v1 wire contract?**

**RED-1 — Snapshot top-level fields (always emitted).** PRESERVE — but PARTIALLY OUTSIDE D20. D20 redacts *entity components*. The snapshot top-level (`status,name,campaignShortId,version,instanceVersion,round,currentActor,zones,adjacency,enchantment`) is **session/instance-level**, not per-entity components. D20 says nothing about projecting the *encounter container* (which top-level fields are emitted, ordering of combatants/zones). GAP: D20 covers per-combatant component visibility but **not the snapshot envelope projection** (top-level field whitelist, zone/adjacency stripping, enchantment, currentActor). The encounter snapshot is more than a list of `visibleEntity` results.

**RED-2 — Per-combatant fields shown to EVERY viewer.** PRESERVE — expressible in D20. `id,name,side,zoneId,hasActed,isCurrent,ailments,battleConditions,conditionDurations,counters,engagedWith` are "public" components (Identity, Allegiance, Position, TurnState flags, Ailments, BattleConditions, ConditionDurations, Counters, Engagement). D20 marks each "public." **Critical PRESERVE the requirement underlines: "an enemy's counters are NOT redacted"** and conditionDurations/engagedWith shown for BOTH sides. D20 can express this *iff* these components are policy=public for all viewers including `opponent`. This is the inverse of the attributes/affinities case and a likely place to get the policy backwards — flag for the security tests (D15): Ailments/BattleConditions/Counters/Engagement/Position must be **public**, not owner+dm, or v2 would over-redact vs v1.

**RED-3 — PC arm carries full vitals + identity (never redacted).** PRESERVE — expressible. PC `hp,sp,attributes,portraitUrl` are public (D7: "PC HP, SP and attributes are public sheet data"). D20 policy=public on Vitals/SkillPool/StatProfile-attributes *for PC entities*. **Subtlety D20 cannot express directly:** the SAME components (Vitals, attributes) are PUBLIC on a PC but DM-ONLY on an enemy (RED-4). D20 attaches a visibility policy *to the component type*, but here the policy depends on the **entity** (PC attributes public, enemy attributes absent). A per-component-type policy is insufficient. See the central D20 finding below.

**RED-4 — Enemy arm: HP/SP only; attributes + affinities STRUCTURALLY ABSENT.** PRESERVE the structural-absence contract; **D20 PARTIALLY EXPRESSES IT, with a real gap.** D20 correctly nails "drop the whole component key, structurally absent not nulled" — that part matches (D14 explicitly cites this as the contract to preserve). BUT: the redaction is **entity-conditional**, not component-type-conditional. v1 emits attributes for PCs and drops them for enemies; the discriminator is the *entity's provenance/side*, which D7 deliberately demotes to cosmetic `Presentation.kind`. D20's "each component declares a visibility policy" is a property of the **component type**, so `attributes` can't be simultaneously public (PC) and absent (enemy) under one policy. To reproduce RED-4 exactly, D20 needs either (a) the policy to be a function of `(component, viewer, entity)` not `(component, viewer)`, or (b) PC and enemy attributes to be *different components*. The log states neither. **This is the security-relevant inexpressibility** — see central finding.

**RED-5 — Current actor redaction `{id,name,side}` or null.** PRESERVE. Snapshot-envelope field, not a component — same RED-1 envelope GAP. The `{id,name,side}` subset is a projection of the actor entity to public-only fields; expressible per-entity via D20 but the *envelope placement* is not.

**RED-6 — Zone redaction (encounter): zone ⇒ `{id,name}` only.** PRESERVE — OUTSIDE D20. Zones are geometry, not entities; D20 redacts entity components only. Stripping `dmNotes/description/position` from zones is a **zone/geometry redaction** the decision log does not model (D20 is entity-scoped). GAP — geometry redaction has no home. Note: the encounter strips `description`/`position` but the dungeon snapshot (DRD-2) KEEPS them — so zone redaction is *snapshot-specific*, which a single per-component policy definitely cannot capture.

**RED-7 — Enchantment observable, not redacted.** PRESERVE — OUTSIDE D20. Enchantment is instance state; passed through (subject to fog). Not an entity component. Envelope/geometry GAP + zone-enchantment-model GAP (ZL-5).

**RED-8 — Fog redaction applies ONLY on a delve Instance.** PRESERVE — OUTSIDE D20 and a notable GAP. D20 has **no notion of a conditional redaction mode** that switches on instance state (`isFogActive`). The whole "standalone encounter = fully visible; delve = additionally fog-redact" toggle (REV-3 gate) is invisible to a per-component visibility policy. The security rationale ("a signed-out viewer could poll the public encounter snapshot during a dungeon fight and read what the dungeon fog strips") makes this a must-have. D20 cannot express it. GAP.

**RED-9 — Fog redaction details (delve encounter).** PRESERVE — OUTSIDE D20 and a GAP. (a) zones filtered to revealed; (b) adjacency keys+values filtered to revealed; (c) a combatant in an unrevealed zone has `zoneId` cleared to `""`; (d) enchantment in unrevealed zone withheld. Item (c) is the only *per-entity* piece, and even it is **not a component drop** — it's a *field mutation* (`zoneId → ""`) conditioned on external fog state, which D20's "drop the whole key" model cannot do (D20 drops a component entirely; it can't conditionally blank a *field within* the Position component based on whether the holder's zone is revealed). Items (a),(b),(d) are geometry/envelope. GAP — major; this is field-level conditional redaction D20 cannot express.

---

## Redaction — dungeon fog snapshot (exploration watch, security-critical)

**DRD-1 — Dungeon snapshot top-level fields.** PRESERVE — OUTSIDE D20 (envelope). `status,name,campaignShortId,version,instanceVersion,turn,zones,connections,exits,combat?`. **Critical: `turn` = the dungeon turn counter ONLY; the turn queue and acted-flags stay DM-only and never enter the payload.** This is a redaction of the *dungeon state blob* (DUN state: `turnCounter` emitted, `actedCharacterIds`/queue withheld), not of entity components. D20 cannot express dungeon-state-blob field redaction. GAP (envelope/state redaction). The dungeon turn loop has a home (DUN-* → reduce-dungeon, see below) but its *snapshot redaction* does not.

**DRD-2 — Only revealed zones emitted, player-facing description.** PRESERVE — OUTSIDE D20 (geometry + fog). Zone ⇒ `{id,name,description,position,tokens,enemies,enchantment?}`; `dmNotes` never read; **description+position ARE emitted** (opposite of RED-6 encounter). Confirms zone redaction is snapshot-specific (encounter strips description/position, dungeon keeps them) — a single component policy cannot serve both. Fog + geometry GAP.

**DRD-3 — Party tokens in revealed zones only.** PRESERVE. Token ⇒ `{characterId,name,portraitUrl,hp,sp,engagement?}`, keyed by `characterId`. "PC HP/SP not redacted (party sees each other), engagement not redacted." The per-token *content* (PC vitals public) is D20-expressible (public Vitals/SkillPool/Identity/Engagement for PC). BUT placement ("revealed zones only," drop tokens of non-roster characters, drop tokens in unrevealed zones) is fog+geometry — OUTSIDE D20. GAP on the fog placement; content side OK.

**DRD-4 — Enemy tokens carry HP only; attributes+affinities STRUCTURALLY ABSENT.** PRESERVE the absence contract; **same D20 entity-conditional inexpressibility as RED-4.** Enemy token = `{id,name,hp,engagement?}`, no attributes/affinities key. Plus: "PC combatants excluded (a charmed PC on enemies side is still a party token)" — the PC/enemy split here is by **durable-PC-identity, not Allegiance side** (D7/D1 — exactly the charmed-PC case D7 cites). And "names disambiguated consistently with the DM rail (NAME-3)" couples this to the shared numbering authority (NAME-3 GAP). The attributes/affinities absence is the same security gap as RED-4: it depends on the entity being an enemy, which D20's per-component-type policy can't condition on. GAP + envelope.

**DRD-5 — Revealed connection `{id,fromZoneId,toZoneId,locked}`.** PRESERVE — OUTSIDE D20 (fog/geometry). Both endpoints revealed. Fog GAP.

**DRD-6 — Known-exit silhouette (far endpoint stripped).** PRESERVE — OUTSIDE D20 and a notable GAP. Exactly-one-endpoint-revealed ⇒ `{id,zoneId,locked}` with `zoneId` = the revealed endpoint only; the far id is **deliberately absent**. This is field-level conditional stripping (drop `toZoneId` based on per-connection fog), the same shape of redaction D20 (component-key drop) cannot express. Fog GAP + field-level redaction GAP.

**DRD-7 — Stripped connections absent from both lists.** PRESERVE — OUTSIDE D20 (fog). Fog GAP.

**DRD-8 — Dungeon zone enchantment (revealed only).** PRESERVE — OUTSIDE D20 (fog + zone-enchantment model). Fog + enchantment GAP.

**DRD-9 — Combat link (observable only).** PRESERVE — OUTSIDE D20 (envelope). `combat = {encounterShortId,round,currentActorName}`, no enemy data. Envelope/state redaction GAP.

---

## Party composition

**PC-1 — Per-side composition by Lineage.** PRESERVE. Tally `pc`-ref combatants on a side by Lineage. Side = Allegiance; Lineage from injected `lineageByCharacterId` (a StatProfile/Identity-adjacent fact). "Skip enemy/catalog-enemy (no Lineage), skip unresolvable Lineage, sparse over LINEAGES." The `pc`-ref filter is the kind→identity supersede (D1). **No home named**; LINEAGES vocabulary carry-over is covered by D2. Lineage is not an explicit O1 component — it's part of StatProfile authoring/Identity; flag minor (where Lineage lives on the entity is unstated).

**PC-2 — Composition for every side.** PRESERVE. `Record<CombatSide, PartyComposition>`. Runs PC-1 per `COMBAT_SIDES`. D2. Home unnamed.

---

## Dungeon turn loop (reducer)

**DUN-1 — `markActed` idempotent append.** PRESERVE — HAS A HOME. The dungeon reducer is explicitly accounted for: CLAUDE.md / D14-context name `engine/dungeon/` (reduceDungeon), and D6 settles the exhaustive-switch reducer style. Idempotent append to `actedCharacterIds`, Immer no-mutate. Aligns with the "reducers use exhaustive switch" + "Immer by state-shape" memory. Reproduced as-is.

**DUN-2 — `advanceTurn` increments + clears acted set.** PRESERVE. Same dungeon reducer home (D6). Preserves `reminderSettings`, no mutation.

**DUN-3 — Reducer deps-free, owns only the temporal loop.** PRESERVE. "Status transitions are NOT reducer events — row-column write in the action layer; mints no ids, consults no GameData; not bound in createGameEngine." This matches the log's own note (D14 context: "dungeon/ … no deps, not in createGameEngine") and D3/D17 (lookups via ports, reducer is behavior). Well-accounted-for.

**DUN-4 — Fresh dungeon defaults.** PRESERVE. `createDungeonState` defaults (turnCounter 0, actedCharacterIds [], reminderSettings.randomEncounters {enabled:false, intervalTurns:6}); every field `.default()`s; `version` is a row column not state. Matches D11 (version is a column, "Computed values never stored") and the Zod-schema-first carry-over (D2). The dungeon-state schema is foundation vocabulary (D2). Accounted-for, though the *specific* dungeon-state schema isn't enumerated in O1 (it's a session/state blob, not an entity component) — consistent with D11's "ephemeral session blob," fine.

---

## Dungeon selectors (derived read state)

**DSEL-1 — Delve roster from Instance occupancy.** PRESERVE. Roster derived from Map Instance occupancy keys, never stored on Dungeon. Geometry/occupancy + Position. **No home named** for the dungeon selectors; the dungeon *reducer* has a home (DUN), the *selectors* do not appear in any D or O1. Plus the Map Instance occupancy model is the unhomed geometry layer (ZG GAP). Flag.

**DSEL-2 — Active acted ids filtered to roster.** PRESERVE. Read-time prune of stale acted entries (departed characters), so the reducer needs no prune write. Pure selector. Home unnamed (dungeon selector layer).

**DSEL-3 — Random-encounter reminder.** PRESERVE. Fires when enabled and `turnCounter` is a positive multiple of `intervalTurns`; never at turn 0; honors interval 1/2/3/6. Pure selector over dungeon state. Home unnamed. The "reminders/roster selectors" the task asked about: **roster (DSEL-1) and reminders (DSEL-3/4/5) selectors have NO explicit home** in D1–D23/O1 — only the reducer (DUN) does.

**DSEL-4 — Exhaustion-onset reminder (always on).** PRESERVE. Fires turns 49,52,55… on `EXHAUSTION_ONSET_INTERVAL` 3 from `EXHAUSTION_ONSET_TURN` 49; constants `DUNGEON_DAY_TURNS` 48. Foundation constants carry-over (D2). Note D14 flags "exhaustion levels 1–6 are placeholder text" as an inherited non-goal — but the *onset reminder cadence* (this requirement) is real, modeled, and distinct from the unshipped exhaustion-level table; v2 must keep the cadence. Home unnamed (dungeon selector + foundation constants).

**DSEL-5 — Both reminders can fire same turn.** PRESERVE. Independent pushes; dismissal is UI-local, never persisted. Home unnamed.

---

## Summary

**Totals:** PRESERVE (incl. PRESERVE+partial-SUPERSEDE): 64 · pure SUPERSEDE: 0 · GAP: 0 outright-unaccounted *behaviors*, but **multiple structural GAPs in the design's coverage** (every requirement is a behavior v2 must keep — none is dropped — but several have no home in D1–D23/O1, and D20 cannot express several exact redaction rules).

Classification counts (primary tag):
- **PRESERVE:** 64 of 64 requirements (every behavior must be reproduced).
- **SUPERSEDE (the kind/ref-union and per-surface-version plumbing *within* preserved behaviors):** SEL-4, SEL-5, FAL-1, NAME-1, NAME-4, ROS-1, ROS-2, ROS-4, ROS-5, ROS-8 (D12 vitalsVersion), ROS-9, ZL-3 — superseded by D1/D7 (kind→capability), D8/D9 (resolve/depletion), D11 (PC vitals on entity), D12 (single version). These keep the *result* but discard the v1 mechanism.
- **GAP (structural — design silent on the home or D20 can't express the rule):** see explicit list below.

### Explicit GAP list

Design-coverage gaps (the behavior is required but the decision log gives it no home, or D20 cannot express it):

1. **View-shaper layer is unnamed.** D1–D23/O1 model the participant entity, resolve, reducer, and visibility filter — but never enumerate the encounter/dungeon **read-shaper functions** (`console-view` CON-1..5, `roster-view` ROS-1..11, `resolve-zone-layout` ZL-1..5, `resolve-engagement` ENG-1..6, `resolve-zone-exits` ZX-1, `setup-roster-view` NAME-4/5 + ENG-2/3/4, `party-composition` PC-1/2, the turn-order selectors SEL-1..5, `resolve-player-view` PV-1/2). They're PRESERVE-by-D2 but un-cataloged; v2 has no stated home for them.

2. **Map Instance geometry / zone-graph layer is unmodeled.** ZG-1..3, ZL-1..2, ROS-10 (move targets), DSEL-1 (occupancy roster) all depend on zone geometry + occupancy that no D or O1 component covers (Position is the only nod, and it's "may live on the map token"). The spatial substrate the whole dungeon/encounter spatial layer rides on has no design entry.

3. **Reveal / fog / connection-lock model is unmodeled.** REV-1..5, ZX-1, RED-8/9, DRD-2/5/6/7/8 all depend on `revealedZoneIds`, `revealedConnectionIds`, `unlockedConnectionIds`, and three-state fog. The decision log never addresses fog/reveal/lock. This is the substrate for *all* fog-gated redaction and is entirely absent.

4. **Zone-enchantment model has no home.** ZL-5, RED-7, DRD-8 read an instance-level zone-enchantment singleton (`{type,name,forte,marking,lines}`); it is neither an entity component (O1) nor named in any D.

5. **Engagement is not a catalog component.** ENG-1..6, ROS-2/ROS-11, ZL-3/ZL-4, PV-2 (omission), DRD-3/4 (engagement?) all need a symmetric melee-lock Engagement component with graph primitives (setEngaged/unlink/cluster) — O1 only says Position "may live on the map token." For D20 to *drop* engagement for the player (PV-2), engagement must first be a redactable component; it isn't defined as one.

6. **Snapshot ENVELOPE projection is outside D20.** RED-1, RED-5, DRD-1, DRD-9 emit/redact *container-level* fields (top-level whitelist, currentActor subset, dungeon `turn`-only while the queue/acted-flags stay DM-only, combat link). D20 redacts entity components only; the encounter/dungeon snapshot is more than a list of `visibleEntity` results, and that wrapper projection has no decision.

7. **Zone/geometry redaction is snapshot-specific and outside D20.** RED-6 strips zone `description`/`position`; DRD-2 KEEPS them. A single per-component-type policy cannot serve both surfaces; D20 (entity-scoped) doesn't touch zone field redaction at all.

8. **(SECURITY) D20 cannot express entity-conditional component redaction.** RED-3 vs RED-4 and DRD-4: `attributes`/`affinities` are PUBLIC on a PC entity but STRUCTURALLY ABSENT on an enemy entity. D20 attaches a visibility policy to the **component type** `(component, viewer)`; the v1 rule keys off the **entity's provenance** (PC vs enemy) — which D7 deliberately demotes to cosmetic `Presentation.kind`. As written, D20 cannot make `attributes` simultaneously public-for-PC and absent-for-enemy. Needs either a `(component, viewer, entity)` policy or PC/enemy attributes as distinct components. **This is the most security-relevant gap.**

9. **(SECURITY) D20 cannot express field-level / conditional-blank redaction.** RED-9(c) clears a combatant's `zoneId → ""` when its zone is unrevealed (a *field mutation within* Position, not a component drop); DRD-6 strips only the far `toZoneId` of a known-exit connection (drop one field, keep siblings). D20's model is "drop the whole component key." It has no notion of (a) blanking a single field, or (b) conditioning redaction on external fog state.

10. **(SECURITY) D20 has no fog-gated / mode-switched redaction trigger.** RED-8: the encounter snapshot fog-redacts *only* on a delve Instance (`isFogActive`), fully visible otherwise. D20 is a static per-component policy with no concept of a redaction mode that flips on instance state. Without it the documented attack (poll the public encounter snapshot mid-dungeon-fight to read fog-stripped content) is reopened.

11. **Shared numbering authority (NAME-3) must precede redaction.** NAME-3 is the single disambiguation home all live surfaces *and* the redacted snapshots (DRD-4 "consistent with the DM rail") route through. D20 produces per-viewer entity projections; nothing states that numbering is computed once over the full roster *before* per-viewer redaction. If redaction runs first, an opponent's view could renumber inconsistently. Sequencing constraint with no decision.

Minor/edge notes folded in above: identity↔character-row link for SEL-4/5 (D11 implies it, unstated); missing-input defaults across FAL-1/ROS-4/5/8/9 (defensive edges to preserve); Lineage's location on the entity (PC-1, unstated); Downed-vs-Fallen draft semantics (CON-3, falls out of Ailments≠Vitals but unstated); ENG-6 clustering robustness to one-sided redacted edges (couples to gap #5/#8).

### Can D20's visibility model reproduce the exact v1 redaction field lists?

**Partially — and the gaps are security-relevant.** D20 gets the *foundational* contract right: "drop the whole component key, structurally absent not nulled" matches the v1 wire contract (D14 cites this explicitly), and the always-public components (RED-2: enemy counters/ailments/conditionDurations/engagedWith NOT redacted; RED-3: PC vitals public) are expressible *if* their policies are set to public for all viewers including `opponent`.

But D20 **cannot** express, as written:

- **Entity-conditional redaction (gaps #8):** the same component (`attributes`/`affinities`) public on a PC and absent on an enemy. D20's policy is per-component-type, not per-entity. This is the core RED-4/DRD-4 contract and the single biggest risk.
- **Field-level / conditional-blank redaction (gap #9):** RED-9(c) `zoneId → ""`, DRD-6 far-`toZoneId` strip. D20 drops whole keys; it can't blank one field or condition on fog.
- **Fog-gated / mode redaction (gap #10):** RED-8's delve-only redaction switch. D20 is static.
- **Envelope + zone/geometry redaction (gaps #6, #7):** the top-level whitelist, currentActor subset, dungeon `turn`-only, and zone `description`/`position` stripping (snapshot-specific, RED-6 vs DRD-2) are entirely outside D20's entity-component scope.

Recommendation surfaced to the user: extend D20 to a `(component, viewer, entity)` policy (or split PC/enemy stat components), add a fog/mode-aware redaction stage, and add an explicit **snapshot-envelope projector** (per surface: encounter vs dungeon) layered on top of `visibleEntity` — plus design entries for the unmodeled geometry/fog/enchantment/engagement substrate and the view-shaper layer.
