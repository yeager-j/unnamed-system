# Annotated — Encounter / Combat-Session Tracker (03)

Classification of every requirement in `requirements/03-encounter-tracker.md`
against the v2 decision log (`decision-log.md`, D1–D23 + O1).

Legend:
- **PRESERVE** — a game rule v2 must reproduce exactly. Mapped to the decision/component that *houses* it. If nothing houses it → **GAP**.
- **SUPERSEDE** — behavior a decision deliberately changes. Cites the D-number.
- **GAP** — design is silent or the rule is inexpressible in the component/reducer model as currently specified.

> **Framing note.** The decision log is overwhelmingly about the *entity / resolve / statblock* model (D1–D22) and persistence (D11). The **encounter reducers themselves** — the turn loop, round lifecycle, drafting/initiative, the Map-Instance spatial reducer — are barely touched. D6 ("reducers switch on event; handlers require capabilities") and D21 (action economy) are the only entries that speak to this file's domain directly; D20 (visibility) and D8/D9/D10 (resolve/vitals) touch the overlay/vitals slices. Everything else in this inventory is a **PRESERVE that, per D2/D6, is carried over largely as-is** — but the log never enumerates the turn-loop events, the Map-Instance reducer, or the derived selectors, so most homes are *implicit* ("carry over v1's wins") rather than explicitly designed. The GAPs below are where that implicitness becomes a real risk.

---

## 1. Session construction

| ID | Class | D / component | Notes |
|---|---|---|---|
| R1.1 | **SUPERSEDE (partial)** + PRESERVE | D9 (vitals), O1 (TurnState, Ailments, BattleConditions, Counters), D21 | A combatant's *clean* starting state maps onto overlay components: ailments=[], battle conditions neutral, no durations, no counters → **PRESERVE** (these overlay components exist in O1). The **action-economy booleans** (`moveAvailable`/`standardAvailable`/`reactionAvailable = true`) are **SUPERSEDE'd by D21**: v2 stores *consumption* (`movesUsed/standardsUsed/reactionsUsed`), not availability booleans; "all available" becomes "0 used vs resolved budget". **GAP-adjacent:** D21 stores `turnsTakenThisRound`, but the inventory's `hasActedThisRound` boolean has no stated successor — see R5.1. |
| R1.2 | **PRESERVE** | D6, O1 | Session construction (round=1, currentActorId=null, advantage=null, firstSide=null, fresh combatants). No decision changes this; carried over. The construction function itself is undocumented in the log → home is implicit. |
| R1.3 | **PRESERVE** | D6, O1 (Position) | Co-minting the Map-Instance spatial state (empty geometry, enchantment=null, empty reveal, one occupancy token per setup with zoneId + engagement default `free`). Position component (O1) notes it "may live on the map token (v1 homed it there)". Map-Instance reducer is **entirely undocumented** in D1–D23 → see GAP-A. |
| R1.4 | **PRESERVE** | D6 | `mapInstanceFromGeometry` (delve-start, structuredClone snapshot). No decision touches Map authoring → implicit. GAP-A. |
| R1.5 | **PRESERVE** | D6 | `toCombatantSetup` round-trip projection. Implicit. |

## 2. Start of combat

| ID | Class | D / component | Notes |
|---|---|---|---|
| R2.1 | **PRESERVE** | D6 | `startCombat` records advantage + firstSide verbatim, no normalisation. This is a reducer rule; D6 keeps the event-switch reducer style. No `advantage`/`firstSide` field is mentioned anywhere in the component catalog (O1) → see GAP-B (session-level fields have no component home). |
| R2.2 | **PRESERVE** | D6 | Idempotent start (no-op once advantage non-null, same-ref). Tied to R24.1. |
| R2.3 | **PRESERVE** | D6, O1 (TurnState) | Round-1 open resets `hasActedThisRound`/`turnsTakenThisRound` + clears actor. Successor for `hasActedThisRound` unclear under D21 (see GAP-C). |

## 3. Initiative (start-of-combat suggestion)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R3.1 | **PRESERVE** (with SUPERSEDE'd inputs) | D8 (resolve), D5, O1 (StatProfile) | `compareInitiative` over each side's highest Agility/Luck. The *computation* is PRESERVE. Its **inputs change**: v1 takes `pcStatsById` + `enemyStatblockById` (two provenance-keyed maps); v2 reads resolved attributes off any entity uniformly via `resolve` (D8 collapses the PC/enemy split). So the function loses its split-source signature → SUPERSEDE on plumbing, PRESERVE on the max-Agility/max-Luck rule. |
| R3.2 | **PRESERVE** | D8 | Empty side → `{null, null}`. |
| R3.3 | **PRESERVE** | — (no decision) | Suggested-leader tiebreak chain (non-empty > Agility > Luck > null). Pure rule; **no decision mentions initiative tiebreaking at all** → home is implicit ("carry over"). Flagged: this is a precise PRESERVE rule with NO explicit design home. See GAP-D. |
| R3.4 | **SUPERSEDE** | D11, D8, D1 | Per-combatant stat resolution **by ref kind** (`pc`/`enemy`/`catalog-enemy`). The entire `kind`-branch is exactly what D1/D11 remove — v2 reads stats off the entity's resolved StatProfile regardless of provenance. The catalog-enemy fallback becomes "ephemeral enemy entity projected from catalog def at load" (D11 storage matrix). |

## 4. Turn drafting (`draftCombatant`)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R4.1 | **PRESERVE** + SUPERSEDE (action reset) | D6, O1 (TurnState, Ailments) | Start the named combatant's turn: set currentActorId, **refresh all three actions**, clear `downed` ailment. The action-refresh is **SUPERSEDE'd by D21** (reset consumption to 0, not booleans to true). The `downed`-clear-on-draft and "keep other ailments" rules are PRESERVE. **GAP-E:** D21 says budget is "snapshotted at turn start" — but the inventory's *draft* event is where that snapshot would happen, and the log never connects `draftCombatant` to the budget snapshot. |
| R4.2 | **PRESERVE** | D6 | No-op for unknown id (same-ref). |
| R4.3 | **PRESERVE** | D6 | Engine never blocks an ineligible draft; eligibility is advisory/selector. D6's "validated no-op" is about *capability mismatch*, not eligibility — this "always apply, never enforce" stance is a distinct PRESERVE rule the log doesn't restate. Implicit but consistent with D6's non-enforcing spirit. |

## 5. End of turn (`endTurn`)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R5.1 | **PRESERVE** | D6, O1 (TurnState) | Mark current actor `hasActedThisRound=true`, keep as currentActor. **GAP-C:** the inventory's per-round acted FLAG (`hasActedThisRound`, a boolean) has no clear successor in D21's TurnState (`turnsTakenThisRound`, a *count*). For single-turn combatants count≥1 ≈ flag, but the mapping is never stated. The "actor not cleared here" rule is PRESERVE. |
| R5.2 | **PRESERVE** | O1 (BattleConditions + ConditionDurations) | **End-of-turn battle-condition duration ticking** — decrement acting combatant's axis durations, expire at 0 (delete duration AND reset axis to neutral). O1 lists `ConditionDurations` and says "durations tick down" — but **WHERE/WHEN the tick happens (the `endTurn` handler) is never specified in any decision**. This is one of the highest-value PRESERVE rules in the file (auto-expiry semantics) and the design only gestures at it. See GAP-F. |
| R5.3 | **PRESERVE** | D6, R24.1 | No-op when no current actor / actor matches nobody. |

## 6. Round lifecycle + roster

| ID | Class | D / component | Notes |
|---|---|---|---|
| R6.1 | **PRESERVE** | D6, O1 (TurnState) | `advanceRound`: ++round, clear actor, reset all acted flags. Same `hasActedThisRound` successor question (GAP-C). The round counter is a session-level field with no component home (GAP-B). |
| R6.2 | **PRESERVE** + SUPERSEDE (acted flag) | D6, O1, D21 | `addCombatant` mid-round joiner enters with `hasActedThisRound=true` (queued for next round). The "already acted this round" semantics must survive D21's count model (GAP-C). |
| R6.3 | **PRESERVE** | D6 | `removeCombatant`; if current actor, clear actor. Engagement-sever is NOT here (rides the token) → see R23.2. |
| R6.4 | **PRESERVE** | D6, O1 (Allegiance) | `setSide` flips one combatant's side. In v2, "side" = the **Allegiance** component (O1). PRESERVE. |

## 7. DM overrides

| ID | Class | D / component | Notes |
|---|---|---|---|
| R7.1 | **PRESERVE** | D6 | `setCurrentActor` writes unconditionally (even bogus id), no acted-flag touch. The "guides, never rejects" stance matches D6 non-enforcement. |
| R7.2 | **PRESERVE** | D6, O1 (TurnState) | `setActed` true/false on one combatant. Same acted-flag successor question (GAP-C). |
| R7.3 | **PRESERVE** | D6 | `setRound` writes round verbatim, no clamp (boundary's job). |

## 8. Battle conditions (axes + flags)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R8.1 | **PRESERVE** | O1 (BattleConditions + ConditionDurations) | adjust axis increase/decrease, start `turns`-long clock (default 3). The whole battle-condition slice maps to the BattleConditions+ConditionDurations overlay components. Component EXISTS; the **clock-start/extend/flip arithmetic is never specified** in any decision → carried implicitly. See GAP-F. |
| R8.2 | **PRESERVE** | O1 (BattleConditions) | Same-direction re-apply **extends** clock, does NOT stack magnitude (Tarukaja twice → 3→6). Subtle PRESERVE rule, no decision restates it. **Note:** D18 ("delta vs override; stacking is effect-declared data") is about *resolve-layer stat transforms*, NOT about battle-condition clock arithmetic — do not conflate. This rule has no home beyond "carry over". |
| R8.3 | **PRESERVE** | O1 (BattleConditions) | Flip direction → reset clock to `turns` (not extend), set new state. Implicit. |
| R8.4 | **PRESERVE** | O1 (BattleConditions + ConditionDurations) | `clear` → axis neutral + delete duration entry. Implicit. |
| R8.5 | **PRESERVE** | O1 (BattleConditions) | `setBattleConditionFlag` (charged/concentrating) manual toggle, no auto-consume, no duration. Implicit. |
| R8.6 | **PRESERVE** | D6, R24.1 | No-op same-ref for unknown id. |

> **Battle conditions are DM-only (CLAUDE.md / UNN-467).** D20's per-component *visibility* policy covers who can SEE/EDIT them; it does not cover the duration arithmetic above.

## 9. Ailments

| ID | Class | D / component | Notes |
|---|---|---|---|
| R9.1 | **PRESERVE** | O1 (Ailments) | `setAilment` idempotent add. Component exists; semantics implicit. |
| R9.2 | **PRESERVE** | O1 (Ailments) | Permissive — multiple ailments co-exist, order preserved. |
| R9.3 | **PRESERVE** | O1 (Ailments) | `clearAilment` removes only named key; absent-key no-change. |
| R9.4 | **PRESERVE** + (validated by D1) | D1, O1 (Ailments) | Ailment edits identical PC/enemy. This *uniformity* is precisely D1's win (overlay is a component any entity carries). PRESERVE on behavior, validated by the component model. |

## 10. Counters

| ID | Class | D / component | Notes |
|---|---|---|---|
| R10.1 | **PRESERVE** | O1 (Counters), D10 (adjacent) | `adjustCounter` signed delta, absent⇒0, floored at 0. Counters component exists (O1; D10 even uses a Counters entry for the Usury loan balance). Floor-at-0 arithmetic is a PRESERVE rule the log doesn't restate. |
| R10.2 | **PRESERVE** | O1 (Counters) | Result 0 deletes key (sparse, positive-only). |
| R10.3 | **PRESERVE** | O1 (Counters) | `clearCounter` removes; absent no-change. |
| R10.4 | **PRESERVE** | D1, O1 (Counters) | Identical PC/enemy — D1 win. **Note inherited non-goal (D14):** per-source counter caps (Lumina/Tells) are *unenforced* in v1 and D14 says "don't fix in v2" — consistent. |

## 11. Action economy (`setActionEconomy`)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R11.1 | **SUPERSEDE** | D21 | `setActionEconomy` flips a per-action availability **boolean**. D21 explicitly replaces the booleans with **consumption** (`movesUsed/...`) vs a **resolved budget**. The non-enforcing, "all reset on draft", "all available on fresh" facts must re-express as consumption=0. **GAP-E lives here too:** D21 describes the *stored shape and budget resolution* but does NOT describe the *event* that toggles one action (the v1 `setActionEconomy` DM override) — is it a "set used to N" event? The log is silent on the write API. |

## 12. Enemy vitals (`adjustEnemyVitals`)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R12.1 | **SUPERSEDE** | D9, D10 | Set an enemy vital field to an absolute value, floored at 0. v2 stores **depletion** (`damage`/`spSpent`), not `currentHP`/`currentSP` (D9). The 0-floor becomes the *operation* clamp (D10: "operations own their bounds"). The whole enemy-specific vitals path collapses into the **uniform Vitals component** (D9) — no enemy-only write. |
| R12.2 | **SUPERSEDE** | D9, D10, D8 | Inline-enemy 4-field write (currentHP/SP/maxHP/maxSP) + "lowering max drags current down". Under D9, currentHP is *derived* from `maxHP − damage`; maxHP is *resolved* (D8). **The "drag current down when max lowers" behavior becomes free** (D9: "form swap moves the ceiling under a form-independent damage invariant — no reconciliation needed"). SUPERSEDE; D9 explicitly claims this falls out for free. |
| R12.3 | **SUPERSEDE** | D9, D1, D11 | catalog-enemy: currentHP/maxHP inline, **no SP** ("catalog enemies have no SP"). This `kind`-leak is the *exact* pathology D1/D8 cite as motivation. v2: SP is a **capability** (SkillPool component present-or-not, D8/O1) — an enemy without SP simply has no SkillPool component, no special-casing. Strong SUPERSEDE. |
| R12.4 | **SUPERSEDE** | D9, D1 | No-op for PC ("PC vitals live on the row"), for SP on catalog enemy, for unknown id. The **PC/enemy vitals split itself is SUPERSEDE'd** — D9 unifies vitals onto one component for all entities; "PC vitals live elsewhere" stops being true. The unknown-id no-op (R24.1) is PRESERVE. |

## 13. Fallen / revive (derived)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R13.1 | **PRESERVE** + SUPERSEDE (plumbing) | D9, D8 | Fallen = `hp <= 0`, recomputed fresh, never stored. D9 **explicitly preserves this**: "fallen is `damage ≥ maxHP`" and is derived, not stored. The *rule* is PRESERVE; the *implementation* shifts to the depletion comparator. **Note edge:** v1 uses `hp <= 0`; D9 phrases it `damage ≥ maxHP`. With over-max HP (D10, negative damage) these agree, but the **`isFallen` threshold (`<= 0` vs `>= maxHP`) must be verified equivalent** under signed damage — minor but worth a parity test. |
| R13.2 | **SUPERSEDE** | D8, D9, D1, D11 | HP source **by ref kind** (pc/enemy/catalog-enemy with catalog-max fallback). The entire kind-branch + provenance-keyed maps collapse into uniform `resolve(entity).maxHP − damage` (D8/D9). Catalog fallback → ephemeral entity from catalog def (D11). The "raise above 0 ⇒ auto-revive, no event" stays true under depletion → PRESERVE that sub-rule. |

## 14. End-of-turn reminders / obligations (read-only projections)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R14.1 | **PRESERVE** | O1 (BattleConditions, ConditionDurations) | `endOfTurnReminders`: heldFlags + activeDurations in canonical order. Read-only projection. **The inventory header says read/view shapers are documented by a DIFFERENT extractor** — but these `end-of-turn.ts` projections ARE in this file, and the **decision log says nothing about them**. PRESERVE, home implicit. |
| R14.2 | **PRESERVE** | — (no decision) | `ailmentHpDelta`: Burn `-floor(maxHP*10/100)`, Sleep `+floor(maxHP*10/100)`, else 0; Despair intentionally 0. Precise numeric PRESERVE rule. **No decision mentions ailment HP effects at all.** Note D14 inherited non-goal: "ailment combat resolution (Technicals/saves) not modeled" — but the Burn/Sleep *HP tick* IS modeled in v1 and must be preserved. See GAP-G. |
| R14.3 | **PRESERVE** | O1 (Mechanics), D17 | `endOfTurnObligations`: per-ailment entries (excl downed), durations, flags, frenzy reminder, from post-`endTurn` session. Reads mechanic state for frenzy → Mechanics component (D17). Composite projection; home implicit. |
| R14.4 | **PRESERVE** + SUPERSEDE (enemy-write shape) | D9, D10, O1 | Ailment `apply` (ready-to-dispatch enemy HP write) = `clamp(currentHP+delta,0,maxHP)`; null for PC/Despair-on-enemy/non-HP/zero-delta. The **clamp-to-[0,maxHP] write** becomes a depletion op (D9/D10). The PC-vs-enemy "apply is null for PC" distinction is the same vitals-split that D9 unifies → the *concept* of a separate enemy HP write softens. PRESERVE the Burn-floor/Sleep-cap; revisit the PC/enemy asymmetry under D9. |
| R14.5 | **PRESERVE** | O1 (Mechanics), D17 | `frenzy` reminder (`{pain}` pre-decrement) only for a PC Berserker in Frenzy Mode. Mechanic-state-aware; D17 binds mechanics. But D14 lists frenzy nowhere; this is a specific PRESERVE behavior reading mechanic state — home is D17's Mechanics component + behavior module, implicit. |

## 15. Party composition (derived)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R15.1 | **PRESERVE** + SUPERSEDE (input) | D8, O1 (Identity/StatProfile/Presentation) | Tally pc-ref combatants on a side by injected Lineage. The `pc`-ref filter + injected `lineageByCharacterId` map is provenance plumbing → SUPERSEDE: v2 reads Lineage off the entity (it's part of the PC's authored identity/profile). The tally rule (count self, skip enemies, sparse) is PRESERVE. |
| R15.2 | **PRESERVE** | D8 | `derivePartyCompositionBySide` over every side. |

## 16. Zone graph queries (derived)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R16.1 | **PRESERVE** | O1 (Position) — **but no spatial reducer in log** | `adjacentZones` neighbor lookup, undefined-safe, no self-adjacency. Pure spatial query. See GAP-A: the Map-Instance / zone-graph layer is essentially undesigned in D1–D23. |
| R16.2 | **PRESERVE** | — | `adjacencyMap` undirected map, self-loop/dangling skipped, dedup. GAP-A. |
| R16.3 | **PRESERVE** | — | `movableZonesForCombatant` (adjacent / anywhere / off-graph), acting zone excluded, `[]` without token. GAP-A. |

## 17. Map-Instance: token movement (`moveCombatant`)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R17.1 | **PRESERVE** | O1 (Position) — GAP-A | Set token zone verbatim, guides not blocks; no-op without token / same-zone. Position component noted in O1 but the *movement reducer* is undocumented. |
| R17.2 | **PRESERVE** | — GAP-A | move→reveal (idempotent; phantom not revealed; connection not auto-revealed). Fog/reveal overlay absent from log. |
| R17.3 | **PRESERVE** | O1 (Position/engagement) — GAP-A | move→break-engagement (symmetric sever of cross-zone partners, keep co-located). Engagement is a precise PRESERVE rule; the log never models engagement at all. See GAP-A + GAP-H. |

## 18. Map-Instance: engagement

| ID | Class | D / component | Notes |
|---|---|---|---|
| R18.1 | **PRESERVE** | — GAP-H | `setEngagement` symmetric mirror onto partners; unvalidated targets (guides). **Engagement appears NOWHERE in D1–D23 or O1** (O1's Position component mentions only "zone / token ref"). The whole symmetric-engagement-graph subsystem is undesigned. |
| R18.2 | **PRESERVE** | — GAP-H | Diff semantics: dropped partner → free (if last link), retained kept, partner's other links intact. |
| R18.3 | **PRESERVE** | — GAP-H | `clearEngagement` → free, remove from partners, others intact; no-op unknown/already-free. |
| R18.4 | **PRESERVE** | — GAP-H | Engagement-graph primitives (`engagedWith`/`setEngaged`/`unlink`). |

## 19. Map-Instance: Zone Enchantment (singleton)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R19.1 | **PRESERVE** | — GAP-A | `applyEnchantment` singleton, replace-on-different. No decision models zone enchantment state. |
| R19.2 | **PRESERVE** | — GAP-A | same-type re-apply raises Forte +1, capped at MAX_FORTE(3). |
| R19.3 | **PRESERVE** | — GAP-A | no-op unknown zone. |
| R19.4 | **PRESERVE** | — GAP-A | `clearEnchantment` → null; no-op when none. |
| R19.5 | **PRESERVE** (effects) | D14, R24.4 | Enchantment effects keyed over closed `EnchantmentType` union; Toccata attackRoll=Forte; Requiem/Tarantella prose-only. **D14 explicitly acknowledges this**: "only Toccata is engine-modeled; Requiem/Tarantella prose-only ⇒ action-economy transform layer partly greenfield." R24.4 notes enchantment behavior is engine-owned, not a catalog port — consistent with D17's mechanics-registry carve-out. So *effects* have a conceptual home (engine-owned behavior, like mechanics); the *enchantment state reducer* (R19.1–4) does not (GAP-A). |

## 20. Map-Instance: zone graph edits (combat-setup protocol)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R20.1 | **PRESERVE** | — GAP-A | `addZone` defaults. |
| R20.2 | **PRESERVE** | — GAP-A | `removeZone` prunes connections + clears enchantment on that zone; occupancy untouched. |
| R20.3 | **PRESERVE** | — GAP-A | `setZoneAdjacency` add/remove edge; dedup; self-loop/missing-zone no-op. |
| R20.4 | **PRESERVE** | — GAP-A | `renameZone`; no-op unknown. |

## 21. Map-Instance: fog/reveal overlay

| ID | Class | D / component | Notes |
|---|---|---|---|
| R21.1 | **PRESERVE** | — GAP-A | reveal/hide zone (idempotent; reveal no-ops unknown, hide unconditional). |
| R21.2 | **PRESERVE** | — GAP-A | reveal/hide connection. |
| R21.3 | **PRESERVE** | — GAP-A | unlock/lock connection (add no-ops unknown, remove unconditional). |
| R21.4 | **PRESERVE** | — GAP-A | `resolveZoneExits` (neighborName fallback, neighborRevealed, hiddenFromPlayers = fog stripped AND conn.hidden, locked). **Note:** D20's visibility filter is per-*component* on entities; the fog/reveal overlay is per-*zone/connection* spatial state — D20 does NOT cover it. |

## 22. Map-Instance: in-console geometry edits (`editGeometry`)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R22.1 | **PRESERVE** | — GAP-A | delegates inner `MapGeometryEvent` to `reduceMapGeometry`; non-removing edits leave overlays untouched. |
| R22.2 | **PRESERVE** | — GAP-A | `deleteZone` blocked when zone holds an occupant (same-ref). |
| R22.3 | **PRESERVE** | — GAP-A | post-removing-edit reveal reconciliation + enchantment clear if zone gone. |
| R22.4 | **PRESERVE** | — GAP-A, R24.1 | no-op inner edit preserves same-ref contract. |

## 23. Occupancy primitives (cross-container, shell-composed)

| ID | Class | D / component | Notes |
|---|---|---|---|
| R23.1 | **PRESERVE** | — GAP-A | `addOccupant` place/replace token. |
| R23.2 | **PRESERVE** | — GAP-A, GAP-H | `removeOccupant` deletes token AND severs removed id from survivors' engagement (symmetric). |
| R23.3 | **PRESERVE** | — GAP-A | `pruneCombat` (combat-end): delete enemy tokens, all survivors → free, enchantment=null, keep zoneId. Ties to D8 layer-5 "combat overlay cleared at end of combat" and D17 `resetOn` end-sweep — but those clear *entity overlay components*, not *spatial occupancy/engagement*. Different sweep, undocumented. |

## 24. Cross-cutting invariants

| ID | Class | D / component | Notes |
|---|---|---|---|
| R24.1 | **PRESERVE** | D6 (implied), D2 | Purity / no-op same-ref / Immer same-ref contract. D6 keeps the reducer style; the inventory header confirms "Immer-drafted". The *purity + same-ref* discipline is a v1 win carried over (D2). No decision restates the same-ref contract explicitly → implicit but consistent. |
| R24.2 | **PRESERVE** | D6 | Exhaustive switch, no default. D6 explicitly: "exhaustive-switch-on-event-type reducer style". Direct home. |
| R24.3 | **PRESERVE** | D6, R-context | `newId` injected at composition root, client id wins over minted. Matches v1 DI pattern (D2 carry-over) + composition root (D8/D17/D23 all reference a composition root). |
| R24.4 | **PRESERVE** | R24.4↔D17 | Only `getEnemy` catalog lookup needed; mechanics/enchantment engine-owned not ports. D17 confirms mechanics registry is engine-owned, not a data port. **But:** under D11, catalog enemies become *ephemeral entities projected from catalog defs at load* — so the in-reducer `getEnemy` lookup (R12.3, R13.2, R14.4) may **move out of the reducer** to the projection boundary. This is a SUPERSEDE of the *seam location*, even though the rule (catalog max resolution) is preserved. See GAP-I. |
| R24.5 | **PRESERVE** | O1 (Position), R1.1 edge | Spatial/non-spatial split: position+engagement ONLY on the Map-Instance token, never on the session combatant; shell routes via `isMapInstanceEvent`. O1's Position note ("may live on the map token — v1 homed it there") gestures at this, but the **two-reducer / two-row split is never an explicit v2 decision** → GAP-A. |

---

## GAP register (the adversarial list)

**GAP-A — The Map-Instance spatial reducer is essentially undesigned.**
D1–D23 + O1 are about *entities and resolve*. The entire `reduceMapInstance` domain — zone geometry (R20), token movement (R17), fog/reveal overlay (R21), Zone Enchantment state (R19.1–4), in-console geometry edits (R22), occupancy primitives (R23), zone-graph queries (R16), and the two-reducer/two-row split (R24.5) — has **no decision entry**. O1's `Position` component is the only acknowledgement, and it's hedged ("may live on the map token"). ~30 PRESERVE requirements (R16–R23, R1.3–R1.4, R24.5) hang off a subsystem the log never designs. This is the single biggest hole.

**GAP-B — Session-level fields have no component home.**
`round`, `currentActorId`, `advantage`, `firstSide` (R1.2, R2.1, R6.1, R7.1, R7.3) are *session-scoped*, not per-combatant. O1's component catalog is entirely *per-entity*; there is no "session/encounter" container component or top-level session-state shape in the model. Where does `advantage`/`firstSide`/`round`/`currentActorId` live in the entity-component world? Undefined.

**GAP-C — `hasActedThisRound` (boolean) has no stated successor under D21.**
D21 stores `turnsTakenThisRound` (a count). The inventory's per-round acted flag is a boolean toggled by `endTurn`/`addCombatant`/`setActed`/reset by `advanceRound`/`startCombat` (R5.1, R6.1, R6.2, R2.3, R7.2). For single-turn combatants count≥1 ≈ flag, but the multi-turn (boss) variant makes "has acted" ambiguous (acted once of three turns?). The log never maps the flag to the count or says how "eligible this round" is derived under multi-turn.

**GAP-D — Initiative tiebreak chain (R3.3) has no design home.**
The precise suggested-leader resolution (non-empty > Agility > Luck-tiebreak > null/DM-d20) is a PRESERVE game rule that **no decision mentions**. Initiative/drafting order is called out in the task as high-priority, and D21 covers the *budget/turnsPerRound* economy but **not** the initiative *suggestion* computation. Carried only by "carry over v1's wins" (D2).

**GAP-E — Turn-start budget snapshot is asserted but not wired to an event.**
D21 says the resolved budget is "snapshotted at turn start" for start-of-turn-in-zone grants. The inventory's turn-start event is `draftCombatant` (R4.1). The log never connects the snapshot to `draftCombatant`, nor specifies where the snapshot is stored (TurnState? a separate resolved-budget cache?). Without this, "available = resolved − used" can't pin the resolved side to a turn.

**GAP-F — Battle-condition duration arithmetic + the end-of-turn tick have no explicit home.**
O1 lists BattleConditions + ConditionDurations and says "durations tick down", but the *clock semantics* — start/default-3 (R8.1), same-direction extend-not-stack (R8.2), flip-resets (R8.3), clear-deletes (R8.4), and crucially the **`endTurn` decrement+auto-expiry** (R5.2) — are never specified in any decision. D18 is about resolve-layer stat stacking, NOT condition clocks (easy to misread as covering it; it doesn't). These are core PRESERVE combat rules.

**GAP-G — Ailment HP tick (Burn/Sleep) numerics not covered.**
R14.2/R14.4: Burn `-floor(maxHP*10/100)`, Sleep `+floor(maxHP*10/100)`, Despair=0. D14's inventory of inherited non-goals says "ailment combat resolution (Technicals/saves) not modeled" — which could be misread to mean ailment effects are out. But the Burn/Sleep HP delta **is** modeled in v1 and is PRESERVE. No decision houses these numerics; the depletion model (D9) is the right vehicle but the rule isn't assigned to it.

**GAP-H — Engagement (the melee-lock graph) is entirely absent from the model.**
Symmetric engagement (R17.3, R18.1–4, R23.2) — set/clear/diff/unlink, symmetric mirroring, break-on-move — is one of the more intricate PRESERVE subsystems and appears in **no decision or component**. O1's Position component mentions only "zone / token ref". The engagement state and its symmetry invariant need a component + reducer home.

**GAP-I — `getEnemy`-in-reducer seam likely moves under D11, but the move is unstated.**
R12.3/R13.2/R14.4 resolve catalog-enemy max HP via `getEnemy` *inside the reducer/projection* (R24.4 names it the one needed lookup). Under D11, catalog enemies become ephemeral entities projected from catalog defs *at load*, which would push the max resolution to the projection boundary and out of the reducer. Whether the v2 session reducer still needs `getEnemy` at all is undecided. (Minor, but it changes R24.4's "one lookup the reducer needs" claim.)

**Minor flags (not full gaps):**
- **R13.1/R13.2 threshold:** v1 `isFallen ⟺ hp <= 0`; D9 phrases fallen as `damage >= maxHP`. Agree only if over-max (negative damage, D10) is handled — needs a parity test, not a redesign.
- **R1.1 / R11.1 action booleans:** cleanly SUPERSEDE'd by D21, but the *write event* shape (how a DM sets "move used") is unspecified (see GAP-E).

---

## Totals

- **PRESERVE:** 53
- **SUPERSEDE:** 11 (R1.1 partial, R3.4, R4.1 partial, R6.2 partial, R11.1, R12.1, R12.2, R12.3, R12.4, R13.2, R15.1 partial; counting partials as supersede where a decision changes a material part)
- **GAP:** 9 distinct gaps (A–I), spanning ~35 individual requirements (the entire Map-Instance block R16–R23 sits under GAP-A).

(Counts: 64 requirement IDs total. Many PRESERVE items carry a GAP annotation because their *behavior* is preserve-class but the design provides *no explicit home* — those are tallied as PRESERVE for class and surfaced in the GAP register for the missing-home problem.)
