# Engine v2 Requirements — Views, Redaction & Dungeon Turn Loop

Read-side requirements inventory for the encounter view/selector shapers, the
player-facing redaction surfaces, the dungeon exploration turn loop, and party
composition. Each item is a testable behavior a v2 implementation must satisfy.
Pure inventory — no design, no keep/modify/drop tagging.

Scope source files:

- `packages/game/src/engine/encounter/`: `selectors.ts`, `console-view.ts`,
  `roster-view.ts`, `setup-roster-view.ts`, `resolve-player-view.ts`,
  `player-snapshot.ts`, `resolve-reveal.ts`, `resolve-zone-layout.ts`,
  `resolve-zone-exits.ts`, `resolve-engagement.ts`, `zone-graph.ts`,
  `engagement-graph.ts`, `fallen.ts`, `party-composition.ts`
- `packages/game/src/engine/dungeon/`: `reduce-dungeon.ts`, `selectors.ts`,
  `player-snapshot.ts`
- `packages/game/src/foundation/dungeon/state.ts` (turn-loop constants)

Combatant `ref` is a closed union of three kinds throughout:

- `pc` — carries `characterId`; identity/vitals/attributes live on the character
  row (injected as `pcDetailById` / `pcInfoById` / `pcCurrentHpById`), never on
  the session.
- `enemy` — inline `statBlock` carrying name + current/max HP + current/max SP +
  attributes.
- `catalog-enemy` — carries `enemyKey` (resolved through the enemy catalog) +
  optional inline working `currentHP`/`maxHP`; **no SP**.

---

## Turn-order selectors (drafting eligibility)

**SEL-1 — Pending combatants.** Combatants who have not acted this round and are
not Fallen, in `session.combatants` order.
`source:` selectors.ts `pendingCombatants`.
`edge:` excludes any id in the injected `fallenIds` set; excludes
`hasActedThisRound === true`; a combatant both acted and Fallen is excluded once
(no double-count); empty input ⇒ empty result.

**SEL-2 — Next drafting side is fully derived (no `draftingSide` stored).** The
side the DM should draft from next.
`source:` selectors.ts `nextDraftingSide`.
`edge:` lead side = `session.firstSide ?? "players"` (null firstSide ⇒ players).
Rules, in order: (a) both sides have 0 pending ⇒ return the lead side (harmless
sentinel; caller advances round); (b) one side has 0 pending ⇒ return the other
side (finish the unexhausted side back-to-back); (c) round 1 with
`advantage === "players" | "enemies"` ⇒ keep drafting the advantaged side until
exhausted; (d) otherwise alternate: the side with fewer `hasActedThisRound`
combatants goes next, ties go to the lead side. Advantage is ignored after round
1. No per-round flip — the lead side leads every round. Fallen are excluded from
"pending" so a side of only Fallen/acted combatants counts as exhausted.

**SEL-3 — Eligible combatants are the next valid picks.** Pending combatants on
the `nextDraftingSide`, in `session.combatants` order.
`source:` selectors.ts `eligibleCombatants`.
`edge:` excludes Fallen on the drafting side; a revived combatant (no longer in
`fallenIds`) re-appears immediately on the next read; both sides entirely Fallen
⇒ `[]` (and `nextDraftingSide` still returns the firstSide sentinel).

**SEL-4 — Session-includes-PC lock predicate.** True iff a `pc` ref with the
given `characterId` is a combatant.
`source:` selectors.ts `sessionIncludesPc`.
`edge:` matches `pc` refs only by `characterId`; never matches `enemy` /
`catalog-enemy` (they carry no character id); absent id ⇒ false.

**SEL-5 — PC combatant character ids.** The `characterId` of every `pc`-ref
combatant.
`source:` selectors.ts `pcCombatantCharacterIds`.
`edge:` skips `enemy` / `catalog-enemy` refs; preserves session order; no PCs ⇒
`[]`.

---

## Fallen derivation (vitals-derived, never stored)

**FAL-1 — Fallen set is recomputed from current HP per kind.** The set of
combatant ids whose current HP is Fallen (`hp <= 0`, via `isFallen`).
`source:` fallen.ts `fallenCombatantIds`.
`edge:` PC HP comes from injected `pcCurrentHpById` keyed by `characterId` — a
PC missing from the map is treated as **not** Fallen; `enemy` HP from inline
`statBlock.currentHP`; `catalog-enemy` HP from inline `ref.currentHP`, defaulting
to the definition's `maxHP` (and 0 when the definition can't be resolved).
Recomputed fresh each read, so a revive (HP back above 0) re-enables the
combatant with no event.

---

## Name disambiguation (numbered combatants)

**NAME-1 — Base combatant name from ref.** Resolve a live combatant's display
name.
`source:` console-view.ts `combatantName`.
`edge:` `pc` ⇒ `pcInfoById[characterId]?.name`, falling back to the raw
`characterId`; `enemy` ⇒ `ref.statBlock.name`; `catalog-enemy` ⇒
`enemyStatblockById[enemyKey]?.name`, falling back to the raw `enemyKey`. Never
renders blank.

**NAME-2 — Ordinal suffix for duplicate names.** Append an order-derived ordinal
to repeated base names.
`source:` console-view.ts `appendOrdinals`.
`edge:` first occurrence stays bare, later repeats become "Name 2", "Name 3";
each base name counted independently; input order preserved; index-aligned to
input; empty input ⇒ `[]`.

**NAME-3 — Live display-name map keyed by combatant id.** Per-combatant
disambiguated label over the session-order list.
`source:` console-view.ts `combatantDisplayNames`.
`edge:` numbers duplicate enemies "Goblin"/"Goblin 2"/"Goblin 3" while a lone PC
stays bare; counts enemies independently of an interleaved PC; keyed by combatant
id in session order. The single home all live surfaces (rail, drawer,
battlefield, snapshots) route through, so numbering can't drift.

**NAME-4 — Setup roster base name from ref.** The pre-combat (`CombatantSetup`)
peer of NAME-1.
`source:` setup-roster-view.ts `baseName` (via `buildSetupCombatantLabels`).
`edge:` same per-kind resolution + raw-id/key fallback as NAME-1, over setup
refs instead of live combatants.

**NAME-5 — Setup roster labels carry numbering from setup into the fight.**
Ordinal-disambiguated labels for a setup roster, index-aligned.
`source:` setup-roster-view.ts `buildSetupCombatantLabels`.
`edge:` reuses `appendOrdinals` (same format as NAME-2); the catalog-enemy ref
stores no per-instance name so the number is derived, never persisted; a
combatant keeps its number from setup into live combat.

---

## Console view (DM turn-order spine)

**CON-1 — Console view assembles rows + actor + drafting side + round-complete.**
`source:` console-view.ts `buildConsoleView`.
`edge:` pure, recomputed on every optimistic session change.

**CON-2 — Per-combatant row flags.** Each row carries `id`, `name`, `side`,
`hasActed` (= `hasActedThisRound`), `isCurrent` (= `id === currentActorId`),
`isFallen`, `isEligible`.
`source:` console-view.ts `buildConsoleView` rows.
`edge:` rows in session order; `name` falls back to combatant id; `isFallen`
from the derived Fallen set; `isEligible` from `eligibleCombatants`.

**CON-3 — Only Fallen are excluded from drafting; Downed stays eligible.** A
Downed combatant is a draft candidate (it recovers at the start of its turn); the
strip treats it as ordinary.
`source:` console-view.ts module doc + `buildConsoleView` (Fallen set is the only
exclusion fed to selectors).
`edge:` excluding Downed would freeze recovery permanently — must not be excluded.

**CON-4 — Current actor view or null.** `{ id, name, side, hasActed }` for the
`currentActorId` combatant, else `null`.
`source:` console-view.ts `buildConsoleView` currentActor.
`edge:` `null` before anyone drafted / between rounds; `hasActed` distinguishes
an active turn from the end-of-turn resolve beat; name falls back to id.

**CON-5 — Drafting side + round-complete flag.** `draftingSide` =
`nextDraftingSide`; `roundComplete` true iff no combatant remains eligible.
`source:` console-view.ts `buildConsoleView`.
`edge:` `roundComplete` = `eligibleIds.size === 0`.

---

## Rail / roster view (DM rail + drawer)

**ROS-1 — Roster grouped by side with enemy rollup.** `players` + `enemies` rail
rows in session order, plus `enemyCount` and `downedEnemyCount`.
`source:` roster-view.ts `buildRosterView`.
`edge:` pure, recomputed on optimistic change; `downedEnemyCount` counts enemy
rows with the `downed` ailment.

**ROS-2 — Rail row shape + token-source split.** Each row: `id`, `name`, `side`,
`isPc`, `isCurrent`, `hasActed`, `isFallen`, `isDowned`, `hp` (Pool), `sp`
(Pool | null), `portraitUrl`, `engagement`, `zoneName`, `reactionAvailable`,
`counters`.
`source:` roster-view.ts `railRow`.
`edge:` `isPc` keyed to ref *kind* (a charmed PC keeps PC token + SP);
`portraitUrl` is the PC's portrait or null, always null for enemies; `sp` is null
for enemies; `name` falls back to combatant id; `engagement` from the Instance
occupancy token (`{ status: "free" }` when no token); `isDowned` =
`ailments.includes("downed")`.

**ROS-3 — Rail zone display name, never the raw id.** `zoneName` resolves the
combatant's occupancy `zoneId` to the zone's display name.
`source:` roster-view.ts `railRow`.
`edge:` `null` when unplaced / unzoned or when the `zoneId` matches no current
zone.

**ROS-4 — PC pool resolution with safe default.** PC HP/SP pools from the
injected detail.
`source:` roster-view.ts `pcPool`.
`edge:` missing detail ⇒ `{ current: 0, max: 0 }` for both kinds.

**ROS-5 — Enemy HP resolution + catalog working-HP default.** Enemy current/max
HP pool.
`source:` roster-view.ts `enemyHp`.
`edge:` `enemy` ⇒ `statBlock.currentHP`/`maxHP`; `catalog-enemy` ⇒ inline
`currentHP`/`maxHP`, each defaulting to the definition's `maxHP` until first
adjusted; definition unresolvable ⇒ 0; a catalog enemy renders at full HP
(`current === max`) until working HP is set; PC ref (unreachable) ⇒
`{ 0, 0 }`.

**ROS-6 — Combatant detail (drawer) or null.** Full per-combatant detail for the
drawer, or `null` for an unknown id.
`source:` roster-view.ts `combatantDetail`.
`edge:` `null` when the combatant id is absent.

**ROS-7 — Detail shared overlay (PC + enemy identical).** `ailments`,
`battleConditions`, `conditionDurations`, `actionEconomy`
(`move`/`standard`/`reaction` from the combatant's `*Available` flags),
`counters` — read straight off the combatant for both kinds.
`source:` roster-view.ts `combatantOverlay`.
`edge:` `conditionDurations` is sparse (absent axis ⇒ no countdown); identical
shape for PCs and enemies.

**ROS-8 — PC detail arm.** `kind: "pc"`, `id`, `characterId`, `vitalsVersion`,
`name`, `side`, `level`, `className`, `pronouns`, `portraitUrl`, `hp`, `sp`,
`attributes`, `affinities`, `skills`.
`source:` roster-view.ts `combatantDetail` (pc branch).
`edge:` missing detail defaults: `vitalsVersion` 0, `level` 1, `className` null,
`pronouns` null, `portraitUrl` null, `hp`/`sp` `{0,0}`, `attributes` all-zero,
`affinities` `{}`, `skills` `[]`; `characterId` is the character-row id (≠ the
combatant id) the pools writes target.

**ROS-9 — Enemy detail arm.** `kind: "enemy"`, `id`, `name`, `side`, `hp`,
`statblock`.
`source:` roster-view.ts `combatantDetail` (catalog-enemy + inline branches).
`edge:` `catalog-enemy` ⇒ resolved `Statblock` from `enemyStatblockById`, falling
back to a minimal inline statblock when the key misses; inline `enemy` ⇒
provisional statblock (flat attributes + working HP only: `level` null,
`affinities` null, `skills` `[]`, `talents` `[]`, `abilities` null,
`weaponAttackRoll` null); an unknown catalog enemy defaults HP and attributes to
zero; working HP rides on the detail `hp` pool, not the statblock.

**ROS-10 — Detail position (move control).** `position`: the combatant's current
zone + the zones it may move to, or `null` when the encounter has no zones.
`source:` roster-view.ts `combatantPosition`.
`edge:` `null` when geometry has zero zones (theater of mind); when placed,
`targets` = adjacent zones; when unplaced (empty or stale `zoneId`), `targets` =
**all** zones; `current` is never in `targets` (no self-loops); recomputed
through a move (move to a new zone re-derives the new zone's neighbors).

**ROS-11 — Detail engagement.** `engagement`: the combatant's engagement value,
target names, and same-zone candidates (see ENG-1).
`source:` roster-view.ts `combatantDetail` → resolve-engagement.ts.

---

## Engagement resolution (drawer control)

**ENG-1 — Combatant engagement shape.** `{ value, targetNames, candidates }`.
`source:` resolve-engagement.ts `resolveCombatantEngagement`.
`edge:` `value` from the Instance occupancy token (`{ status: "free" }` when no
token); `targetNames` = engaged target ids resolved to display names (`[]` when
Free); `candidates` = every *other* combatant sharing this one's `zoneId`
(unzoned/empty `zoneId` ⇒ everyone) **plus any current targets** so an existing
engagement is always clearable even if a partner moved zones; names fall back to
ids.

**ENG-2 — Same-zone engageable targets (setup).** The setup combatants the slot
at `index` may engage: every *other* placed combatant in the same `zoneId`.
`source:` setup-roster-view.ts `engageableTargets`.
`edge:` side-agnostic (may engage an ally); skips id-less setups; self excluded;
out-of-range index ⇒ `[]`; labels index-aligned to setups.

**ENG-3 — Mutual (symmetric) engagement set on setup roster.** Set a combatant's
engagement to exactly `targetIds`, mirroring onto every affected target.
`source:` setup-roster-view.ts `setEngagementTargets`.
`edge:` a newly-added target gains the combatant; a dropped target loses it
(reverting to Free when no links remain); id-less setups untouched.

**ENG-4 — Normalize engagements drops cross-zone/missing links.** Drop every
engagement target not in the same `zoneId` as its holder.
`source:` setup-roster-view.ts `normalizeEngagements`.
`edge:` unzoned encounter (all `zoneId` empty) leaves engagements untouched;
moving out of zone or removing a partner clears the link (Free when none remain);
symmetric; must be re-run after any placement/roster change.

**ENG-5 — Engagement-holder primitives (symmetric melee-lock graph).**
`engagedWith` reads target ids (`[]` when Free); `setEngaged` re-stamps from a
list (Free when empty); `unlink` removes one partner (Free when last link, no-op
when not engaged with it).
`source:` engagement-graph.ts.
`edge:` operate in place on any `{ engagement }` holder (combatant or map token);
callers pass Immer drafts.

**ENG-6 — Engagement clustering (connected components).** Partition a zone's
tokens into connected components of the symmetric melee-lock graph.
`source:` resolve-zone-layout.ts `groupTokensByEngagement`.
`edge:` empty input ⇒ `[]`; a Free token (or `engagement` absent) is a singleton;
a target absent from the token set or a self-link contributes no edge; a token
reaches a partner through its *own* edge even if the partner's engagement is
absent (redacted); chains (A–B, B–C) merge into one cluster; disjoint pairs stay
separate; group order = first-member input order; members ordered by input order.

---

## Zone graph

**ZG-1 — Adjacent zones (resolved objects).** The zones bordering `zoneId`.
`source:` zone-graph.ts `adjacentZones`.
`edge:` walks id-keyed connections; undefined-safe (a connection pointing at a
removed zone is skipped); a zone is never adjacent to itself.

**ZG-2 — Movable zones for a combatant.** The zone ids a combatant may move to.
`source:` zone-graph.ts `movableZonesForCombatant`.
`edge:` `[]` when the combatant has no token; with `anywhere` on, or when the
combatant stands off the graph, every other zone; otherwise the acting zone's
adjacent zones; the acting zone is always excluded.

**ZG-3 — Adjacency map (wire shape).** The full undirected graph as
`zoneId → bordering zoneId[]`.
`source:` zone-graph.ts `adjacencyMap`.
`edge:` skips self-loops and connections whose endpoints don't both exist;
dedupes neighbors; ids only (no connection flags leaked).

---

## Zone layout (DM battlefield)

**ZL-1 — Zone layout view.** `{ zones, unplaced, hasZones }`.
`source:` resolve-zone-layout.ts `resolveZoneLayout`.
`edge:` `zones` in `instance.geometry.zones` insertion order; `unplaced` =
combatants whose occupancy `zoneId` isn't a current zone (empty default or stale
id); `hasZones` = geometry has ≥1 zone; pure, recomputed on optimistic change;
referential integrity not enforced (stale `zoneId` ⇒ `unplaced`).

**ZL-2 — Zone entry.** Per zone: `id`, `name`, `adjacentZoneNames` (ids→display
names), `combatants` (tokens in the zone), `enchantment?`, `engaged`.
`source:` resolve-zone-layout.ts `resolveZoneLayout`.
`edge:` adjacency resolved to names, undefined-safe for removed zones.

**ZL-3 — Zone token.** Per token: `id`, `name`, `side`, `isPc`, `portraitUrl`,
`hp`, `sp`, `engagement`.
`source:` resolve-zone-layout.ts `zoneToken`.
`edge:` `name` = the disambiguated label (numbers consistently with rail/player
view); PC ⇒ portrait + pcPool HP/SP; enemy ⇒ null portrait, working HP, null SP;
PC detail miss ⇒ null portrait; DM shaper always sets `engagement` (`{free}`
default).

**ZL-4 — Zone reads Engaged when both sides occupy it.** `engaged` true iff the
zone holds at least one `players` token and at least one `enemies` token.
`source:` resolve-zone-layout.ts `zoneIsEngaged`.
`edge:` derived from the zone's token list (not the UI); used by both DM + player
layouts.

**ZL-5 — Enchantment badge.** The active zone-enchantment badge for `zoneId`:
`{ type, name, forte, marking, lines }`.
`source:` resolve-zone-layout.ts `zoneEnchantmentBadge`.
`edge:` `undefined` when the session's singleton enchantment is absent or sits on
a different zone; `name` from the enchantment definition; `marking` from
`forteMarking(forte)` (f / ff / fff); `lines` = one per definition forte line
with `active` true for lines at-or-below the current forte (1-indexed); shared by
the DM layout and the player view.

---

## Zone exits (DM run console)

**ZX-1 — Zone exits.** Every connection touching `zoneId`, each as
`{ connection, neighborName, neighborRevealed, hiddenFromPlayers, locked }`.
`source:` resolve-zone-exits.ts `resolveZoneExits`.
`edge:` `neighborName` falls back to `"Unknown"` for a dangling connection;
`neighborRevealed` from the reveal set; `hiddenFromPlayers` true iff the fog
state is `stripped` AND the connection is authored `hidden`; `locked` from the
effective-locked rule (REV-2).

---

## Reveal / fog primitives

**REV-1 — Zone revealed predicate.** `isZoneRevealed` is true iff `zoneId` is in
`reveal.revealedZoneIds`.
`source:` resolve-reveal.ts `isZoneRevealed`.

**REV-2 — Effective connection lock.** `isConnectionLocked` = authored `locked`
flag unless the DM has unlocked it at runtime.
`source:` resolve-reveal.ts `isConnectionLocked`.
`edge:` an un-locked connection is never locked regardless of unlock overlay; a
locked connection becomes unlocked when its id is in `unlockedConnectionIds`.

**REV-3 — Fog-active predicate (delve vs standalone).** `isFogActive` =
`reveal.revealedZoneIds.length > 0`.
`source:` resolve-reveal.ts `isFogActive`.
`edge:` a delve reveals ≥1 zone on start (non-empty = fog-gated); a standalone
encounter never populates reveal (empty = full map visible). This is the gate
that decides whether the encounter snapshot fog-redacts.

**REV-4 — Three-state connection fog.** `connectionFogState` returns `revealed` /
`known-exit` / `stripped`.
`source:` resolve-reveal.ts `connectionFogState`.
`edge:` a `hidden` connection is `stripped` until its id is in
`revealedConnectionIds`; once surfaced (or never hidden): both endpoints revealed
⇒ `revealed`, exactly one ⇒ `known-exit`, neither ⇒ `stripped`.

**REV-5 — Reveal view of an instance.** `{ revealedZoneIds, connections }` where
each connection carries `{ connection, state, locked }`.
`source:` resolve-reveal.ts `resolveRevealView`.
`edge:` `state` per REV-4, `locked` per REV-2; copies the revealed-zone-id array.

---

## Player view battlefield (encounter watch)

**PV-1 — Player zone layout from snapshot.** Shapes the same `ZoneLayoutView` as
the DM, from the redacted `EncounterSnapshot`.
`source:` resolve-player-view.ts `resolvePlayerZoneLayout`.
`edge:` zones in `snapshot.zones` order; combatants grouped by `zoneId`;
`adjacentZoneNames` resolved from `snapshot.adjacency` ids→names (ids with no
matching zone dropped); a combatant whose `zoneId` matches no current zone goes
to `unplaced`; `hasZones` = `snapshot.zones.length > 0`; pure, recomputed every
poll.

**PV-2 — Player zone token.** Per snapshot combatant: `id`, `name`, `side`,
`isPc` (= `kind === "pc"`), `portraitUrl`, `hp`, `sp`.
`source:` resolve-player-view.ts `playerZoneToken`.
`edge:` `engagement` is deliberately omitted (snapshot carries no `Engagement`
object — the grid ignores it); HP/SP ride from the redacted snapshot (enemy arm
carries no SP); enchantment badge + `engaged` per zone reuse ZL-4/ZL-5.

---

## Redaction — encounter player snapshot (security-critical)

The encounter watch is signed-out-visible; the player only ever receives the
projected `EncounterSnapshot`. Redaction is **structural**: a stripped field is
never written, so it is *absent* from the JSON (not present as `null`).

**RED-1 — Snapshot top-level fields (always emitted).** `status`, `name`,
`campaignShortId`, `version`, `instanceVersion`, `round`, `currentActor`,
`combatants`, `zones`, `adjacency`, `enchantment`.
`source:` player-snapshot.ts `projectPlayerSnapshot`.
`edge:` `combatants` in session (turn) order; `zones` in geometry order;
`version` + `instanceVersion` are the two advisory tokens the watch hook compares
(they leak nothing — the same numbers the public ping publishes).

**RED-2 — Per-combatant fields shown to EVERY viewer (PC and enemy).** `id`,
`name`, `side`, `zoneId`, `hasActed`, `isCurrent`, `ailments`,
`battleConditions`, `conditionDurations`, `counters`, `engagedWith`.
`source:` player-snapshot.ts `PlayerCombatantBase` / `projectCombatant`.
`edge:` `engagedWith` = engaged target ids resolved to display names (`[]` when
Free) — engagement is observable battlefield state, shown for both sides;
`counters` (e.g. Lumina/Illuminated) is public observable state, shown for both
sides — **an enemy's counters are NOT redacted**; `conditionDurations` shown for
both sides.

**RED-3 — PC arm carries full vitals + identity.** The `pc` arm adds `kind:"pc"`,
`hp` (Pool), `sp` (Pool), `attributes` (AttributeScores), `portraitUrl`.
`source:` player-snapshot.ts `PlayerVisibleCombatant` (pc) / `projectCombatant`.
`edge:` PC HP, SP, and attributes are public sheet data — **fully visible, never
redacted**; missing detail ⇒ HP/SP `{0,0}` and all-zero attributes; portrait null
default.

**RED-4 — Enemy arm carries HP/SP only; attributes + affinities STRUCTURALLY
ABSENT.** The `enemy` arm adds `kind:"enemy"`, `hp` (Pool), `sp` (Pool | null),
`portraitUrl: null`. It has **no `attributes` key and no `affinities` key** — the
projection never writes them, so `"attributes" in enemy` and `"affinities" in
enemy` are both false on the wire.
`source:` player-snapshot.ts `PlayerVisibleCombatant` (enemy) / `projectCombatant`.
`edge:` enemy `sp` is `null` for catalog enemies (no SP), a real Pool for an
inline statblock that carries one; enemy `portraitUrl` always `null`; enemy HP via
`enemyHp` (catalog working-HP default, ROS-5). Proven by structural-absence tests
(source seeded with attributes + affinities to prove they are *dropped*).

**RED-5 — Current actor redaction.** `currentActor` = `{ id, name, side }` for
the acting combatant, or `null`.
`source:` player-snapshot.ts `projectPlayerSnapshot`.
`edge:` `null` when no one is acting; name falls back to id.

**RED-6 — Zone redaction (encounter).** Each emitted zone is projected to
`{ id, name }` only.
`source:` player-snapshot.ts `projectPlayerSnapshot` zones.
`edge:` the DM-private `dmNotes` (and `description`/`position`) never cross the
wire.

**RED-7 — Enchantment is observable, not redacted.** The Instance's active zone
enchantment is passed through (subject to fog, RED-9).
`source:` player-snapshot.ts `projectPlayerSnapshot` enchantment.
`edge:` `null` when no enchantment; passed through verbatim (`{ zoneId, type,
forte }`) for a standalone encounter.

**RED-8 — Fog redaction applies ONLY on a delve Instance.** When
`isFogActive(reveal)` (the delve case), the spatial fields are additionally
fog-redacted; a standalone encounter (empty reveal) stays fully visible.
`source:` player-snapshot.ts `projectPlayerSnapshot`.
`edge:` rationale is security — without this a signed-out viewer could poll the
public encounter snapshot during a dungeon fight and read what the dungeon fog
strips.

**RED-9 — Fog redaction details (delve encounter).** When fogged:
`source:` player-snapshot.ts `projectPlayerSnapshot`.
`edge:` (a) `zones` includes only revealed zones; (b) `adjacency` includes only
revealed-zone keys, and each neighbor list keeps only revealed neighbors (so an
undiscovered zone id never appears as a key or value); (c) any combatant standing
in an unrevealed zone has its `zoneId` cleared to `""` (both PC and enemy); a
combatant in a revealed zone keeps its real `zoneId`; (d) an enchantment in an
unrevealed zone is withheld (`null`).

---

## Redaction — dungeon fog snapshot (exploration watch, security-critical)

The dungeon fog view is signed-out-visible. Redaction is **structural** and is a
release gate (a regression leaks DM-only content). In exploration the occupancy
holds PC tokens only; enemy data enters only during combat (M4).

**DRD-1 — Dungeon snapshot top-level fields.** `status`, `name`,
`campaignShortId`, `version`, `instanceVersion`, `turn`, `zones`, `connections`,
`exits`, and `combat?` (present only during a fight).
`source:` dungeon/player-snapshot.ts `projectDungeonSnapshot`.
`edge:` `turn` = the dungeon turn counter only — the turn queue and acted-flags
stay DM-only and never enter the payload; `combat` key is absent in exploration,
present (and spread in) during combat.

**DRD-2 — Only revealed zones emitted, with player-facing description.** Each
revealed zone ⇒ `{ id, name, description, position, tokens, enemies,
enchantment? }`.
`source:` dungeon/player-snapshot.ts `projectDungeonSnapshot` zones.
`edge:` undiscovered zones are absent entirely; the private `dmNotes` is **never**
read (no `dmNotes` key on the wire); `description` + `position` ARE emitted
(player-facing, unlike the encounter snapshot which strips them).

**DRD-3 — Party tokens placed in revealed zones only.** Each token ⇒
`{ characterId, name, portraitUrl, hp, sp, engagement? }`, keyed by the placed
character's `characterId`.
`source:` dungeon/player-snapshot.ts `tokensByRevealedZone`.
`edge:` a token in an unrevealed zone is dropped (can't leak); a token whose
occupant isn't a delve-roster character is dropped (during combat the shared
Instance also carries enemy tokens keyed by combatant id — they must NOT surface
as "Unknown" chips); PC HP/SP are public sheet data, **not** redacted (the party
sees each other's vitals); `engagement` is player-observable, not redacted.

**DRD-4 — Enemy tokens (combat overlay) carry HP only; attributes + affinities
STRUCTURALLY ABSENT.** During combat, enemy tokens grouped by revealed zone ⇒
`{ id, name, hp, engagement? }`.
`source:` dungeon/player-snapshot.ts `combatEnemyTokensByZone` (grouping) +
`projectDungeonSnapshot` (placement).
`edge:` PC combatants excluded (they render as party tokens — a charmed PC on the
enemies side is still a party token); enemies grouped by Instance zone; an enemy
absent from occupancy buckets under the empty-zone key `""`; enemies placed only
into revealed zones (an enemy in an undiscovered zone never leaks); names
disambiguated consistently with the DM battlefield/rail (NAME-3); the shape has
no `attributes`/`affinities` key — they cannot leak.

**DRD-5 — Revealed connection.** A connection both of whose endpoints are
revealed ⇒ `{ id, fromZoneId, toZoneId, locked }`.
`source:` dungeon/player-snapshot.ts `projectDungeonSnapshot` connections.
`edge:` `locked` = effective lock (REV-2).

**DRD-6 — Known-exit silhouette (far endpoint stripped).** A connection with
exactly one revealed endpoint ⇒ `{ id, zoneId, locked }`, where `zoneId` is the
**revealed** endpoint only.
`source:` dungeon/player-snapshot.ts `projectDungeonSnapshot` exits +
`revealedEndpoint`.
`edge:` the far (undiscovered) zone's id is deliberately absent — no `toZoneId`
or far-id key; the far zone never appears in the revealed zone list; exposes only
*that* an exit exists + whether it's locked.

**DRD-7 — Stripped connections absent from both lists.** A `stripped`-fog
connection (hidden+unrevealed, or neither endpoint revealed) appears in neither
`connections` nor `exits`.
`source:` dungeon/player-snapshot.ts `projectDungeonSnapshot`.
`edge:` a hidden connection the DM hasn't revealed is omitted entirely.

**DRD-8 — Dungeon zone enchantment.** A revealed zone's active enchantment badge
is emitted; one sitting on an unrevealed zone never surfaces.
`source:` dungeon/player-snapshot.ts `projectDungeonSnapshot` (via
`zoneEnchantmentBadge`).
`edge:` because only revealed zones are emitted, an enchantment on an
undiscovered zone has nowhere to surface (`undefined`).

**DRD-9 — Combat link (observable only).** `combat` = `{ encounterShortId,
round, currentActorName }` passed through verbatim during a fight.
`source:` dungeon/player-snapshot.ts `projectDungeonSnapshot`.
`edge:` absent in exploration; carries only the public encounter shortId, round,
and acting combatant name — no enemy data.

---

## Party composition

**PC-1 — Per-side party composition by Lineage.** Tally `pc`-ref combatants on a
given side by Lineage, including the character itself.
`source:` party-composition.ts `derivePartyComposition`.
`edge:` counts only combatants on the requested side; ignores `enemy` /
`catalog-enemy` refs (no Lineage); skips a PC whose Lineage can't be resolved
from the injected `lineageByCharacterId`; result is sparse over `LINEAGES`; a
side with no PCs ⇒ `{}`.

**PC-2 — Composition for every side.** A `Record<CombatSide, PartyComposition>`,
one composition per side.
`source:` party-composition.ts `derivePartyCompositionBySide`.
`edge:` runs PC-1 for every `COMBAT_SIDES` entry so a caller can index by a
combatant's own side.

---

## Dungeon turn loop (reducer)

**DUN-1 — `markActed` records a character this turn (idempotent).** Append
`characterId` to `actedCharacterIds`.
`source:` reduce-dungeon.ts `reduceDungeon` (markActed).
`edge:` no-op if already present (no duplicate); preserves existing acted ids;
leaves `turnCounter` untouched; never mutates the input (Immer).

**DUN-2 — `advanceTurn` increments counter and clears acted set.** `turnCounter
+= 1`, `actedCharacterIds = []`.
`source:` reduce-dungeon.ts `reduceDungeon` (advanceTurn).
`edge:` preserves `reminderSettings`; never mutates the input.

**DUN-3 — Reducer is deps-free and owns only the temporal loop.** Status
transitions (`draft → active → done`) are NOT reducer events — they are a
row-column write in the action layer; the reducer mints no ids and consults no
`GameData`.
`source:` reduce-dungeon.ts module doc + signature.
`edge:` grouped exhaustive switch with no `default` (a new event kind fails to
compile until handled); not bound in `createGameEngine` (imported directly).

**DUN-4 — Fresh dungeon defaults.** A freshly-minted dungeon is `turnCounter: 0`,
`actedCharacterIds: []`, `reminderSettings.randomEncounters { enabled: false,
intervalTurns: 6 }`.
`source:` foundation/dungeon/state.ts `createDungeonState` / `dungeonStateSchema`.
`edge:` every field `.default()`s so a freshly-minted blob parses; `version` is a
row column, never part of the state shape.

---

## Dungeon selectors (derived read state)

**DSEL-1 — Delve roster from Instance occupancy.** The roster (characters in the
dungeon) = the Map Instance occupancy keys — derived, never stored on the
Dungeon.
`source:` dungeon/selectors.ts `deriveDungeonRoster`.
`edge:` placing a token adds a character to the delve; empty occupancy ⇒ `[]`.

**DSEL-2 — Active acted ids filtered to the current roster.** The acted-this-turn
ids that are still in the roster.
`source:` dungeon/selectors.ts `activeActedCharacterIds`.
`edge:` a stale acted entry for a departed character (token removed) is dropped at
read-time (so the reducer never needs a prune write); empty roster ⇒ `[]`.

**DSEL-3 — Random-encounter reminder.** Fires when enabled and `turnCounter` is a
positive multiple of the configured `intervalTurns`.
`source:` dungeon/selectors.ts `dungeonReminders`.
`edge:` does not fire when disabled even on a multiple; never fires at turn 0 (the
un-started delve); honors each interval (1/2/3/6) — at interval 1 it fires every
turn; `turn` field = the threshold counter value.

**DSEL-4 — Exhaustion-onset reminder (always on, no setting).** Fires from
`EXHAUSTION_ONSET_TURN` (49) on each `+EXHAUSTION_ONSET_INTERVAL` (3) cadence —
turns 49, 52, 55…
`source:` dungeon/selectors.ts `dungeonReminders` + foundation constants
(`DUNGEON_DAY_TURNS` 48, `EXHAUSTION_ONSET_TURN` 49, `EXHAUSTION_ONSET_INTERVAL`
3).
`edge:` never fires on or before turn 48; fires once per threshold (not every
turn — the selector fires only when the counter is *exactly* a threshold value);
does not fire at 48/50/51/53/54.

**DSEL-5 — Both reminders can fire on the same turn.** When a turn is both a
random-encounter multiple and an exhaustion threshold, both nudges are returned.
`source:` dungeon/selectors.ts `dungeonReminders`.
`edge:` reminders are independent pushes onto one array; dismissal is
component-local UI state, never persisted.
