# Requirements Inventory — Encounter / Combat-Session Tracker

Scope: the encounter combat-session reducer + turn loop and the Map-Instance
spatial reducer (state-transition side only). Read/view shapers
(`selectors.ts`, `console-view`, `roster-view`, `resolve-player-view`,
`player-snapshot`, `resolve-zone-layout`, `resolve-reveal`) are documented by a
different extractor and are **not** covered here. Each item is a testable
behavior a v2 implementation must satisfy.

Two pure reducers exist:

- **`reduceCombatSession(lookups, newId)(session, event)`** — the **non-spatial**
  combat session (round, combatants, current actor, advantage). Grouped
  exhaustive `switch` over `CombatEvent.kind`, no `default`.
- **`reduceMapInstance(newId)(state, event)`** — the **spatial** state (zone
  geometry, occupancy tokens, engagement, Zone Enchantment, fog/reveal overlay).
  Grouped exhaustive `switch` over `MapInstanceEvent.kind`, no `default`.

Both are **deciders**: deterministic, no I/O, no mutation; Immer-drafted; curried
deps-first. `newId` is injected for deterministic tests.

Vocabulary constants (foundation):
- `COMBAT_SIDES = ["players", "enemies"]`
- `COMBAT_ADVANTAGES = ["players", "enemies", "neutral"]`
- `BATTLE_CONDITION_AXIS_KEYS = ["attack", "defense", "hitEvasion"]`
- `BATTLE_CONDITION_FLAG_KEYS = ["charged", "concentrating"]`
- `DEFAULT_BATTLE_CONDITION_TURNS = 3`
- `AILMENT_KEYS = [downed, burn, freeze, shock, dizzy, forget, sleep, confuse, fear, despair, rage, brainwash]`
- `COUNTER_KEYS = ["lumina", "tells"]`
- `MAX_FORTE = 3`
- `isFallen(hp) ⟺ hp <= 0`

---

## 1. Session construction

**R1.1** A combatant built from setup starts non-spatial-clean: no ailments
(`[]`), all battle conditions neutral (`{ ...DEFAULT_BATTLE_CONDITIONS }`), all
three actions available (`moveAvailable`/`standardAvailable`/`reactionAvailable
= true`), no condition durations (`{}`), no counters (`{}`).
source: `session-factory.ts` `makeCombatant`.
edge: `hasActedThisRound` is the caller's argument (false at setup, true for a
mid-round joiner). Position/engagement are NOT on the combatant — they live on
the Map-Instance occupancy token.

**R1.2** `createCombatSession(newId)(setup[])` builds the initial session: `round
= 1`, `currentActorId = null`, `advantage = null`, `firstSide = null`, every
combatant fresh and `hasActedThisRound = false`.
source: `session-factory.ts` `createCombatSession`.
edge: a combatant's id is its own `setup.id` when supplied, else `newId()`.

**R1.3** `createMapInstance(newId)(setup[])` co-mints the spatial state from the
same setup: empty geometry (`{ zones: {}, connections: {} }`), `enchantment =
null`, empty reveal overlay (all three arrays empty), and one occupancy token per
setup carrying its `zoneId` and `engagement` (defaulting to `{ status: "free" }`).
source: `session-factory.ts` `createMapInstance`.
edge: token key resolves identically to the session id (`setup.id ?? newId()`),
so occupancy and roster share ids. Empty `setup` → blank instance.

**R1.4** `mapInstanceFromGeometry(geometry)` mints a delve-start instance from an
authored Map: a deep copy of the geometry (`structuredClone` — snapshot
isolation), empty occupancy, `enchantment = null`, empty reveal overlay.
source: `session-factory.ts` `mapInstanceFromGeometry`. edge: deps-free (no id
minting — geometry already carries stable ids).

**R1.5** `toCombatantSetup(combatant, token)` projects a combatant + its token
back to a `CombatantSetup`: id/side/ref from the combatant, `zoneId`/`engagement`
from the token. source: `session-factory.ts` `toCombatantSetup`. edge: with no
token, defaults `zoneId: ""` and `engagement: undefined`.

---

## 2. Start of combat (`startCombat`)

**R2.1** `startCombat` records the DM's opening declaration verbatim: sets
`session.advantage` and `session.firstSide` to the event's values, with NO
normalisation (a non-neutral advantage with a mismatched firstSide is recorded
as-is — that coupling is the shell's invariant, not the reducer's).
source: `reduce/turn-start.ts` `reduceStartCombatEvent`.
edge: `firstSide` is recorded even when `advantage` is `neutral`.

**R2.2** `startCombat` is a no-op once `advantage` is non-null — an encounter
cannot start twice; returns the original session reference unchanged.
source: `reduce/turn-start.ts`. edge: same-ref return.

**R2.3** `startCombat` opens round 1 cleanly: resets every combatant's
`hasActedThisRound` to `false` and sets `currentActorId = null`.
source: `reduce/turn-start.ts`. edge: makes an event-assembled roster (where
`addCombatant` enters combatants with `hasActedThisRound = true`) all-eligible in
round 1; a no-op on a fresh `createCombatSession` roster (already all false). Does
not touch the encounter DB status (`draft`/`live`/`ended`) — that's the shell's job.

---

## 3. Initiative (start-of-combat suggestion)

**R3.1** `compareInitiative(combatants, pcStatsById, enemyStatblockById)`
computes each side's highest Agility and highest Luck (each maximum taken
independently over all that side's combatants) plus a `suggested` leader.
source: `initiative.ts` `compareInitiative` / `sideInitiative`.

**R3.2** A side with no combatants yields `{ highestAgility: null, highestLuck:
null }`. source: `initiative.ts` `sideInitiative`.

**R3.3** Suggested-leader resolution order: a non-empty side beats an empty side;
otherwise higher Agility wins; on an Agility tie, higher Luck wins; a true tie
(equal through Luck) returns `null` (the rulebook's DM-d20 case).
source: `initiative.ts` `suggestedSide`.
edge: both sides empty → `null`. The Luck tiebreak only runs when Agility is
tied; a side leading on Agility but trailing on Luck still wins. Negative
Agility still beats an empty opposing side.

**R3.4** Per-combatant initiative stats resolve by ref kind: `pc` from injected
`pcStatsById[characterId]`; `enemy` from its inline statblock attributes;
`catalog-enemy` from the resolved statblock by `enemyKey`.
source: `initiative.ts` `resolveStats`. edge: a PC with no supplied stats, or an
unknown catalog key, resolves to `null` and that combatant is ignored.

---

## 4. Turn drafting (`draftCombatant`)

**R4.1** `draftCombatant` starts the named combatant's turn: sets
`currentActorId` to that combatant, refreshes all three actions to available
(`moveAvailable`/`standardAvailable`/`reactionAvailable = true`), and clears the
`downed` ailment (the one start-of-turn effect) while keeping all other ailments.
source: `reduce/draft.ts` `reduceDraftCombatantEvent`.
edge: does NOT set `hasActedThisRound` (that is `endTurn`'s job).

**R4.2** `draftCombatant` is a no-op for an unknown combatant id (returns the
original session reference). source: `reduce/draft.ts`.

**R4.3** The engine never blocks an "ineligible" draft — drafting any combatant
(wrong side, already acted, fallen) is always applied. Eligibility is an advisory
UI concern derived by selectors, never enforced here.
source: `reduce/draft.ts` (ADR Decision 8).

---

## 5. End of turn (`endTurn`)

**R5.1** `endTurn` marks the current actor `hasActedThisRound = true`, keeping
them as `currentActorId` (the actor is NOT cleared — clearing is `advanceRound`).
source: `reduce/turn.ts` `reduceTurnEvent`. edge: it marks the *actual* current
actor, not merely `combatants[0]`.

**R5.2** `endTurn` ticks the current actor's battle-condition durations down by 1
each: an axis with `remaining > 1` becomes `remaining - 1`; an axis at
`remaining <= 1` (i.e. reaching 0) is deleted from `conditionDurations` AND its
`battleConditions[axis]` is reset to `neutral` (auto-expiry).
source: `reduce/turn.ts`.
edge: only the *acting* combatant's durations tick (not others'); an axis with no
duration entry is left untouched (its overlay state is unchanged even if
non-neutral); only the axis that hit 0 expires, the rest decrement.

**R5.3** `endTurn` is a no-op (same-ref return) when `currentActorId` is `null`,
or when the current actor id matches no combatant.
source: `reduce/turn.ts`.

---

## 6. Round lifecycle (`advanceRound`) + roster (`addCombatant` / `removeCombatant` / `setSide`)

**R6.1** `advanceRound` increments `round` by 1, sets `currentActorId = null`, and
resets every combatant's `hasActedThisRound` to `false`.
source: `reduce/round.ts` `reduceRoundEvent`.
edge: always produces a new session even when no flag was set (idempotent
round-end safeguard); it is the ONLY event that clears all acted flags + the
actor together.

**R6.2** `addCombatant` appends a fresh combatant built via `makeCombatant` with
`hasActedThisRound = true` — a mid-round joiner is queued for the next round, not
acting this one. source: `reduce/round.ts`.
edge: id is `event.setup.id` when supplied, else `newId()`; existing combatants
are left untouched.

**R6.3** `removeCombatant` drops the matching combatant; if it was the current
actor, `currentActorId` is set to `null`.
source: `reduce/round.ts`.
edge: a no-op (same-ref) for an unknown id; severing the removed id from
survivors' engagement is NOT done here (engagement rides the Instance token — see
R12.2 `removeOccupant`); the shell pairs the two in one transaction.

**R6.4** `setSide` flips one combatant's `side`, leaving the rest untouched.
source: `reduce/round.ts`. edge: a no-op (same-ref) for an unknown id.

---

## 7. DM overrides (`setCurrentActor` / `setActed` / `setRound`)

**R7.1** `setCurrentActor` sets `currentActorId` to the given id
**unconditionally** — even an unknown/bogus id is written as-is (guides, never
rejects), without touching any acted flag. source: `reduce/override.ts`
`reduceOverrideEvent`. edge: this is NOT the way to clear the actor — clearing is
`advanceRound`.

**R7.2** `setActed` sets one combatant's `hasActedThisRound` to the supplied
boolean (can set true or un-flag to false) without touching the current actor.
source: `reduce/override.ts`. edge: a no-op (same-ref) for an unknown id —
contrast with `setCurrentActor`'s unconditional write.

**R7.3** `setRound` sets `session.round` to the supplied value without touching
any combatant flag or the current actor. source: `reduce/override.ts`.
edge: schema requires a positive int; no clamping in the reducer.

---

## 8. Battle conditions (axes + flags)

**R8.1** `adjustBattleConditionAxis` with `increase`/`decrease` sets the axis
overlay to `increased`/`decreased` and starts a `turns`-long clock.
source: `reduce/conditions.ts` `reduceBattleConditionEvent`.
edge: `turns` defaults to `DEFAULT_BATTLE_CONDITION_TURNS` (3) when omitted.

**R8.2** Re-applying the **same** direction to an axis already in that state
**extends** the clock (adds `turns` to the remaining count), it does NOT stack the
magnitude (Tarukaja twice → axis stays `increased`, duration 3 → 6).
source: `reduce/conditions.ts`.

**R8.3** Flipping direction (e.g. `increased` → `decrease`) resets the clock to
`turns` rather than extending, and sets the axis to the new state.
source: `reduce/conditions.ts`.

**R8.4** `adjustBattleConditionAxis` with `clear` sets the axis to `neutral` and
deletes its duration entry. source: `reduce/conditions.ts`.

**R8.5** `setBattleConditionFlag` toggles a single-use flag (charged /
concentrating) on or off as given — manual, no auto-consume, no duration tick.
source: `reduce/conditions.ts`.

**R8.6** All battle-condition edits are a no-op (same-ref) for an unknown
combatant id. source: `reduce/conditions.ts`.

---

## 9. Ailments (`setAilment` / `clearAilment`)

**R9.1** `setAilment` adds an ailment key to the combatant's `ailments` array; it
is idempotent (no duplicate key added if already present).
source: `reduce/ailments.ts` `reduceAilmentEvent`.

**R9.2** Ailments are **permissive**: multiple ailments co-exist (no
"one-non-Downed-at-a-time" enforcement); order preserved as added.
source: `reduce/ailments.ts`.

**R9.3** `clearAilment` removes only the named key, leaving the rest; clearing an
absent key is a harmless no-change (still produces a result with the same array
contents). source: `reduce/ailments.ts`.

**R9.4** Ailment edits work identically on PC and enemy combatants (the overlay
is uniform). edge: a no-op (same-ref) for an unknown combatant id. Does not
mutate a frozen input. source: `reduce/ailments.ts`.

---

## 10. Counters (`adjustCounter` / `clearCounter`)

**R10.1** `adjustCounter` adds a signed `delta` to the current count (absent ⇒
0), floored at 0. source: `reduce/counters.ts` `reduceCounterEvent`.
edge: delta-not-absolute so back-to-back nudges merge against the loaded session.

**R10.2** When `adjustCounter`'s result is 0, the counter key is deleted (sparse
map; positive-only invariant). source: `reduce/counters.ts`. edge: overshooting
negative drops the key (e.g. 2 then −5 → key removed).

**R10.3** `clearCounter` removes the counter outright; clearing an absent counter
is a harmless no-change. source: `reduce/counters.ts`.

**R10.4** Counter edits work identically on PC and enemy combatants. edge: a
no-op (same-ref) for an unknown combatant id; does not mutate a frozen input.
source: `reduce/counters.ts`.

---

## 11. Action economy (`setActionEconomy`)

**R11.1** `setActionEconomy` flips one of `move`/`standard`/`reaction`
availability (mapping to `moveAvailable`/`standardAvailable`/`reactionAvailable`)
to the supplied boolean, touching only the named action.
source: `reduce/action-economy.ts` `reduceActionEconomyEvent`.
edge: non-enforcing — never blocks acting; a no-op (same-ref) for an unknown id.
A fresh combatant has all three available; all three reset on `draftCombatant`
(R4.1).

---

## 12. Enemy vitals (`adjustEnemyVitals`)

**R12.1** `adjustEnemyVitals` sets one field of an enemy's working vitals to an
absolute `value`, floored at 0 (overkill can't drive a value negative).
source: `reduce/enemy-vitals.ts` `reduceEnemyVitalsEvent`.

**R12.2** For an **inline `enemy`** ref it writes the field on `statBlock` and
supports all four fields (`currentHP`, `currentSP`, `maxHP`, `maxSP`). Lowering a
max drags the matching current down with it: `currentHP = min(currentHP, newMaxHP)`
and `currentSP = min(currentSP, newMaxSP)`. source: `reduce/enemy-vitals.ts`.

**R12.3** For a **`catalog-enemy`** ref it writes `currentHP`/`maxHP` inline on
the ref only (catalog enemies have no SP — SP fields are ignored, returning the
same session ref). When setting `maxHP`, current is clamped against the prior
current, which defaults to the definition's `maxHP` (resolved via
`getEnemy(enemyKey)`) until first set. source: `reduce/enemy-vitals.ts`.
edge: an unknown catalog `enemyKey` resolves the definition max to 0, so a fresh
`maxHP` set yields `currentHP = 0`.

**R12.4** `adjustEnemyVitals` is a **no-op (same-ref)** for a PC combatant (PC
vitals live on the character row), for an SP field on a catalog enemy, and for an
unknown combatant id. source: `reduce/enemy-vitals.ts`.

---

## 13. Fallen / revive (derived, not stored)

**R13.1** `fallenCombatantIds(session, pcCurrentHpById, enemyStatblockById)`
returns the set of combatant ids that are Fallen (`hp <= 0`), recomputed fresh
each read — Fallen is never stored. source: `fallen.ts` `fallenCombatantIds`.

**R13.2** HP source by ref kind: `pc` from injected `pcCurrentHpById[characterId]`;
`enemy` from `statBlock.currentHP`; `catalog-enemy` from inline `ref.currentHP`,
defaulting to the definition's `maxHP` (via `enemyStatblockById[enemyKey]`) until
first adjusted. source: `fallen.ts`.
edge: a PC missing from `pcCurrentHpById` is treated as **not** Fallen; a
catalog enemy with unset working HP and a >0 definition max is not Fallen; an
unknown catalog enemy with unset HP falls back to max 0 ⇒ **Fallen**. Raising a
PC's HP above 0 drops it from the set with no event (revive is automatic).

---

## 14. End-of-turn reminders / obligations (read-only projections)

**R14.1** `endOfTurnReminders(combatant)` returns `heldFlags` (charged/
concentrating still set, in canonical flag order) and `activeDurations` (axes
with a positive countdown, in canonical axis order).
source: `end-of-turn.ts` `endOfTurnReminders`. edge: clean combatant → both empty;
absent/zero durations are skipped.

**R14.2** `ailmentHpDelta(ailment, maxHP)`: Burn = `-floor(maxHP*10/100)`; Sleep
= `+floor(maxHP*10/100)`; every other ailment = 0. source: `end-of-turn.ts`
`ailmentHpDelta`. edge: rounded down; Despair is intentionally 0 (it drains SP,
never auto-applied to HP).

**R14.3** `endOfTurnObligations(getEnemy)(session, actorId, pcMechanicByCharacterId?)`
returns per-ailment entries (excluding `downed`), `activeDurations`, `heldFlags`,
and a `frenzy` reminder, read from the **post-`endTurn`** session.
source: `end-of-turn.ts` `endOfTurnObligations`.
edge: unknown actor → fully empty result `{ ailments: [], activeDurations: [],
heldFlags: [], frenzy: null }` (even if another combatant has obligations).

**R14.4** An ailment's `apply` (the ready-to-dispatch enemy HP write) is non-null
only for an enemy carrying Burn/Sleep: `value = clamp(currentHP + delta, 0,
maxHP)`. It is `null` for a PC (vitals on the row), for Despair on an enemy (no
SP), for a non-HP ailment, and for a zero delta. source: `end-of-turn.ts`
`resolveAilmentApply` / `enemyWorkingHP`. edge: catalog-enemy max resolves via
`getEnemy` fallback (unknown key → max 0 → `apply: null`); Burn floors at 0,
Sleep caps at maxHP.

**R14.5** The `frenzy` reminder is `{ pain }` (the value *before* decrement) only
when the actor is a PC whose active mechanic is Frenzy **in Frenzy Mode**;
otherwise `null` (enemy actor, non-Berserker, Berserker not in Frenzy, no active
mechanic, or no mechanic map supplied). source: `end-of-turn.ts`
`resolveFrenzyReminder`.

---

## 15. Party composition (derived)

**R15.1** `derivePartyComposition(session, side, lineageByCharacterId)` tallies
each `pc`-ref combatant on `side` by its injected Lineage, counting the character
itself. source: `party-composition.ts`. edge: enemy refs are ignored (no
Lineage); a PC with no resolvable Lineage is skipped; result is sparse; a side
with no PCs → `{}`.

**R15.2** `derivePartyCompositionBySide` returns a composition for every
`CombatSide`. source: `party-composition.ts`.

---

## 16. Zone graph queries (derived)

**R16.1** `adjacentZones(instance, zoneId)` returns the neighbor `Zone` objects of
`zoneId`. source: `zone-graph.ts`. edge: undefined-safe (a connection pointing at
a removed zone is skipped); a zone is never adjacent to itself; a zone with no
connections → `[]`.

**R16.2** `adjacencyMap(geometry)` returns the undirected `zoneId →
neighbor-ids[]` map. source: `zone-graph.ts`. edge: self-loop connections skipped;
connections dangling to a non-existent zone (either endpoint) skipped; no
duplicate neighbor ids.

**R16.3** `movableZonesForCombatant(instance, combatantId, { anywhere })` returns
the zone ids a combatant may move to: the acting zone's adjacent zones (default),
or **every other zone** when `anywhere` is true OR the combatant stands off the
graph. The acting zone is always excluded. source: `zone-graph.ts`.
edge: returns `[]` when the combatant has no token.

---

## 17. Map-Instance: token movement (`moveCombatant`)

**R17.1** `moveCombatant` sets the token's `zoneId` to `toZoneId` verbatim
(guides, does not block — a non-adjacent or non-existent target is applied).
source: `reduce-map-instance.ts` `reduceMoveEvent`.
edge: no-op (same-ref) when the combatant has no token, or when moving to the
already-occupied zone.

**R17.2 (move → reveal)** Entering a zone adds it to `reveal.revealedZoneIds`
(idempotent — no duplicate). source: `reduce-map-instance.ts`. edge: a phantom
(non-existent) destination is NOT revealed; the touched connection is NOT written
to `revealedConnectionIds` (known exits derive).

**R17.3 (move → break-engagement)** Leaving a zone severs every engagement with a
partner not co-located in the destination, **symmetrically** on both tokens; an
engagement with a partner already in (or who shares) the destination zone is
kept. source: `reduce-map-instance.ts`.
edge: a stale engagement target that has no token is tolerated (the moving
token's link is dropped, no throw); only cross-zone partners are severed while
co-located ones remain.

---

## 18. Map-Instance: engagement (`setEngagement` / `clearEngagement`)

**R18.1** Engagement is **symmetric**: `setEngagement` replaces the token's
targets and mirrors the change onto every affected partner (added partners gain
this id; dropped partners lose it). source: `reduce-map-instance.ts`
`reduceEngagementEvent`. edge: target ids are unvalidated (engine guides; the DM
control offers same-zone candidates).

**R18.2** Diffing on `setEngagement`: a partner dropped from the target list
reverts to `free` (if that was its last link) while a retained partner is kept;
dropping a partner leaves that partner's *other* engagements intact.
source: `reduce-map-instance.ts`.

**R18.3** `clearEngagement` sets the token to `free` and removes the id from each
partner; a freed partner's other links stay intact.
source: `reduce-map-instance.ts`.
edge: a no-op (same-ref) for an unknown combatant id, and a no-op when clearing an
already-Free token.

**R18.4** Engagement-graph primitives (shared): `engagedWith(holder)` returns the
target list or `[]` when Free; `setEngaged(holder, targets)` re-stamps to `free`
when empty else `engaged`; `unlink(holder, otherId)` removes one id (reverting to
Free on the last link), a no-op when not engaged with that id.
source: `engagement-graph.ts`.

---

## 19. Map-Instance: Zone Enchantment (singleton)

**R19.1** `applyEnchantment` to an un-enchanted/different zone or with a different
type sets the singleton `enchantment = { zoneId, type, forte: 1 }` (a second
enchanted zone replaces the first). source: `reduce-map-instance.ts`
`reduceEnchantmentEvent`.

**R19.2** Re-applying the **same type** to the **already-enchanted zone** raises
Forte by 1, capped at `MAX_FORTE` (3). source: `reduce-map-instance.ts`.

**R19.3** `applyEnchantment` is a no-op (same-ref) when the zone id is unknown.
source: `reduce-map-instance.ts`.

**R19.4** `clearEnchantment` sets `enchantment = null`; a no-op (same-ref) when
none is active. source: `reduce-map-instance.ts`.

**R19.5** Enchantment **effects** (rule behavior, keyed over the closed
`EnchantmentType` union): Toccata grants `attackRoll` bonus = Forte; Requiem and
Tarantella grant no structured effects (prose-only rules). `getEnchantment(type)`
is total. `zoneEnchantmentEffects(enchantment, zoneId)` returns the effects only
when an enchantment is active AND `enchantment.zoneId === zoneId`, else `[]`.
source: `enchantment.ts`.

---

## 20. Map-Instance: zone graph edits (combat-setup protocol)

**R20.1** `addZone` records a `MapZone`: `{ id, name, description: "", dmNotes:
event.notes ?? "", position: { x: 0, y: 0 } }`. id is `event.zoneId ?? newId()`.
source: `reduce-map-instance.ts` `reduceZoneGraphEvent`. edge: `notes` maps to
`dmNotes`; `description`/`position` default.

**R20.2** `removeZone` deletes the zone, prunes every connection touching it, and
clears the `enchantment` if it sat on that zone; occupancy is left untouched
(placement cleanup is separate). source: `reduce-map-instance.ts`.
edge: a no-op (same-ref) for an unknown zone id; an enchantment on a *different*
zone is preserved.

**R20.3** `setZoneAdjacency(adjacent: true)` mints an id-keyed `MapConnection`
`{ id, fromZoneId, toZoneId, hidden: false, locked: false }`; idempotent — no
duplicate edge for an existing pair. `setZoneAdjacency(adjacent: false)` deletes
the existing connection between the pair. source: `reduce-map-instance.ts`.
edge: no-op (same-ref) for a self-edge (`zoneIdA === zoneIdB`) or when either zone
is missing; clearing a non-present edge leaves other neighbors intact.

**R20.4** `renameZone` updates the zone's display `name`; a no-op (same-ref) for
an unknown zone id. source: `reduce-map-instance.ts`.

---

## 21. Map-Instance: fog/reveal overlay

**R21.1** `revealZone` adds a zone to `revealedZoneIds` (idempotent); a no-op
(same-ref) for an unknown zone id. `hideZone` removes it (idempotent; a no-op
same-ref when absent). source: `reduce-map-instance.ts` `reduceRevealEvent`.

**R21.2** `revealConnection` adds a connection to `revealedConnectionIds`
(idempotent, no-op same-ref on unknown id); `hideConnection` removes it.
source: `reduce-map-instance.ts`.

**R21.3** `unlockConnection` adds a connection to `unlockedConnectionIds`
(idempotent, no-op same-ref on unknown id); `lockConnection` removes it.
source: `reduce-map-instance.ts`.
edge: reveal/unlock (the *add* ops) no-op on unknown ids so a phantom can't enter
the set; hide/lock (the *remove* ops) are unconditional drops.

**R21.4** Zone-exit derivation: `resolveZoneExits(instance, zoneId)` returns one
`ZoneExit` per connection touching the zone with `neighborName` (fallback
`"Unknown"`), `neighborRevealed`, `hiddenFromPlayers` (fog state `stripped` AND
`conn.hidden`), and `locked`. source: `resolve-zone-exits.ts`.

---

## 22. Map-Instance: in-console geometry edits (`editGeometry`)

**R22.1** `editGeometry` delegates the inner `MapGeometryEvent` to
`reduceMapGeometry` over `state.geometry`, producing geometry identical to the
template reducer (add/rename/setText/move zones; add/flag/delete connections,
including dedup/self-loop/cascade guards). source: `reduce-map-instance.ts`
`reduceGeometryEditEvent`. edge: occupancy/engagement/enchantment/reveal are left
untouched for non-removing edits.

**R22.2** A `deleteZone` whose zone holds an occupancy token is **blocked** — a
no-op (returns the same `state` ref). source: `reduce-map-instance.ts`.

**R22.3** After a removing edit (`deleteZone`/`deleteConnection`), the reveal
overlay is reconciled: `revealedZoneIds`/`revealedConnectionIds`/
`unlockedConnectionIds` are filtered to ids that still exist in the new geometry,
and `enchantment` is cleared if its zone no longer exists.
source: `reduce-map-instance.ts`. edge: deleting a connection prunes the
connection's reveal/unlock entries but leaves zone reveals.

**R22.4** A no-op inner edit (unknown id, empty/whitespace rename, duplicate/
self-loop connection) leaves `reduceMapGeometry` returning the same geometry ref,
so `editGeometry` returns the same `state` ref (preserves the no-op contract).
source: `reduce-map-instance.ts`.

---

## 23. Occupancy primitives (cross-container, shell-composed)

**R23.1** `addOccupant(state, combatantId, token)` places or replaces a token
keyed by combatant id, leaving other tokens untouched. source: `occupancy.ts`.

**R23.2** `removeOccupant(state, combatantId)` deletes the token AND severs the
removed id from every survivor's engagement (symmetric — no dangling one-sided
melee-lock); other engagements of survivors are kept.
source: `occupancy.ts`. edge: removing an unengaged combatant leaves unrelated
tokens untouched.

**R23.3 (combat-end cleanup)** `pruneCombat(state, removeCombatantIds[])` deletes
the named tokens (the fight's enemies), sets every surviving token to `free`, and
clears `enchantment = null`. Surviving tokens keep their `zoneId` (party persists
where the fight ended). source: `occupancy.ts`. edge: with nothing to prune it
still returns a clean shape (enchantment null, survivors intact).

> Note: `addOccupant`/`removeOccupant`/`pruneCombat` are pure helpers the shell
> composes alongside the session reduce in a single transaction — they are NOT
> `MapInstanceEvent`s and do not travel through `reduceMapInstance`.

---

## 24. Cross-cutting invariants

**R24.1 (purity / no-op same-ref)** Every reducer is pure: it never mutates its
input (frozen inputs do not throw) and returns a **new** object on change. Every
documented no-op returns the **original reference** (Immer's same-ref contract on
an untouched draft). source: all reducer files; `reduce-session.integration.test.ts`
"purity" suite.

**R24.2 (exhaustive dispatch)** Both reducers dispatch via a grouped `switch` with
no `default`; a new event kind must be both handled in a slice and routed, or the
build fails ("not all code paths return a value"). source: `reduce-session.ts`,
`reduce-map-instance.ts`.

**R24.3 (id minting seam)** `newId` is injected at the composition root and used
only where ids are minted (`addCombatant` fallback, `addZone`/`setZoneAdjacency`).
A client-supplied id always wins over the minted fallback.
source: `reduce-session.ts`, `reduce-map-instance.ts`, `session-factory.ts`.

**R24.4 (catalog lookup seam)** The only `GameData` lookup the session reducer
needs is `getEnemy` (catalog-enemy max-HP resolution in `adjustEnemyVitals` and
end-of-turn obligations). `reduceMapInstance` needs no catalog lookup. Mechanics
and enchantment behavior are engine-owned, not catalog ports.
source: `reduce-session.ts`, `reduce-map-instance.ts`, `enchantment.ts`.

**R24.5 (spatial/non-spatial split)** Position and engagement live ONLY on the
Map-Instance occupancy token, never on the session combatant; the session reducer
reads/writes no spatial field. The shell splits a combined wire payload via
`isMapInstanceEvent` and routes each event to the correct reducer + row.
source: `session.ts`, `map-instance-event.ts`.

---

## Ambiguities / notes (factual)

- **No dedicated test file** exists for the core turn-loop slices (`draft`,
  `turn`, `turn-start`, `round`, `override`, `conditions`). Their behavior is
  covered by `engine/__integration__/reduce-session.integration.test.ts` (an
  integration test using the `reduceCombat` fixture). The slice-level files
  themselves were read from source.
- **`firstSide` normalisation** is deliberately a shell invariant, not a reducer
  rule: the reducer records any `{ advantage, firstSide }` pair verbatim (R2.1),
  including a non-neutral advantage paired with a mismatched firstSide. A v2
  reducer must NOT normalise here.
- **`setRound`** accepts a positive int per the event schema but the reducer does
  no validation/clamping — out-of-range guarding is the boundary's job.
- **Enchantment effects** model only engine-computable rules (Toccata's attack
  bonus); Requiem/Tarantella rule text is DM-adjudicated prose carried as
  `forteLines`, intentionally not in `effects()`.
- **`adjustEnemyVitals` schema vs runtime floor:** the persisted schema keeps
  `currentHP`/`currentSP` as plain ints (no nonnegative constraint); the reducer
  is the sole enforcement point for the 0-floor, so persisted sessions are not
  re-validated against it.
