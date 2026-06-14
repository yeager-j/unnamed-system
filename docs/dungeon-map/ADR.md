# ADR: Dungeon Map Architecture

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here.

**Status:** Draft · **Owner:** Jackson · **Date:** 2026-06-14
**Builds on:** [Initiative Tracker ADR](../initiative-tracker/ADR.md) (Campaign, the combatant overlay, the `CombatSession`) · [Real-Time Data Strategy ADR](../realtime/ADR.md) (the Ably invalidation-ping transport)
**Related:** [Dungeon Map — PRD](./PRD.md)

---

## Context

_[To be written — what's shipped (the combat tracker, its `CombatSession` owning `zones`/`adjacency`/`combatant.zoneId`, the Ably invalidation-ping layer), what the PRD asks for, and the premise this ADR adopts: the Map Instance is the single spatial truth, and **all spatially-determined state — occupancy, reveal, engagement, enchantment — lives on it**. What still stands from the PRD; what this ADR revises.]_

---

## Decision summary

| # | Decision | Choice |
| -- | -- | -- |
| 1 | **The model** | **Four entities: Map / Map Instance / Dungeon / Encounter.** A **Map** is a reusable, user-owned authored template; selecting one mints a **Map Instance** — a per-run snapshot that owns all spatial runtime. A **Dungeon** (exploration-time) and the existing **Encounter** (combat-time) are purely temporal layers over one Instance. The Instance is the single spatial truth; the temporal layers **invoke** its spatial transitions, never reimplement them. |
| 2 | **Spatial refactor (§0, prerequisite)** | Lift `zones` / `adjacency` / `combatant.zoneId` **+ engagement + enchantment** off the `CombatSession` onto the Map Instance. Existing encounters are disposable — **truncate + reseed, no backfill** (the destructive step rides the feature merge, long after Friday). **Combat behavior unchanged** — this is a refactor, and the gate for everything else. |
| 3 | **Engagement & enchantment home** | **On the Map Instance**, with occupancy and reveal-state. Both are verified **combat-scoped + spatially-located** (engagement breaks on leaving a Zone; enchantment is per-Zone and ends with combat), so they prune at combat-end. Co-locating engagement with occupancy makes a **combat move a single-row write** and keeps the `move → break-engagement` rule in the same reducer as `move → reveal`. |
| 4 | **Persistence** | `maps` (user-owned template, geometry jsonb, `version`) + `map_instances` (per-run snapshot: geometry + occupancy + reveal + engagement + enchantment, `version`) + `dungeons` (`campaignId`, exploration-state jsonb, `version`). `encounters` **gains `mapInstanceId`** and **drops** inline `zones` / `adjacency`. |
| 5 | **Concurrency & atomicity** | Per-row optimistic `version` guards (reuse `version-guard`). Cross-container writes are **designed away** where the rules allow (a normal move costs no turn ⇒ Instance-only; "act" and "reveal" are separate gestures). The remaining ~4 genuinely-atomic, rare, confirm-gated lifecycle gestures (delve start, combat start, combat end, search-that-reveals) use one transaction composing per-row guards (`guardMany`). **No per-move transaction.** |
| 6 | **Reducer topology** | `reduceMapInstance` (every spatial transition: `move → reveal`, `move → break-engagement`, enchant, **and the Edit-mode geometry edits**) · `reduceDungeon` (the turn loop) · `reduceCombatSession` **repointed** to read position from the Instance instead of owning `zoneId`. Purity holds; statefulness stays in the DB and React. |
| 7 | **Combat on the dungeon** | Starting combat **places enemy combatants onto the live Instance** and layers a turn loop over it — no carved sub-graph, no copy. The whole map is in play (kiting). In exploration the DM moves tokens freely; once combat is live, occupancy is written **only through the Encounter's movement model**. Combat-end prunes enemy tokens + engagement + enchantment, persists PC positions, and advances the consumed dungeon turn. |
| 8 | **Console topology** | **One `/dungeon/[shortId]` route with an Edit ⇄ Play mode toggle, orthogonal to lifecycle status** (`draft` / `active` / `done`). Edit mode = the full builder toolset on the Instance, available **regardless of status** (in-run geometry editing ships in v1; destructive edits guarded). Map **template** authoring lives on a separate user-owned **My Maps** editor. |
| 9 | **Rendering substrate** | **React Flow (`@xyflow/react`, MIT core)**, behind a lazy `"use client"` island. Two spikes gate the commit: **token-drag-along-adjacency** and the **graph-keyboard / aria-live accessibility pass**. **Hand-rolled SVG + `d3-zoom`** is the documented escape hatch. |
| 10 | **Transport** | Reuse the **Ably invalidation-ping**. New `dungeon:{shortId}` + map-instance channels; the watch view subscribes to **both** the encounter and instance channels while combat is live. Polling stays the degraded-mode fallback. No new infra. |
| 11 | **Player view** | A **redacted Instance projection**, polled (~1.5s), signed-out-visible. Three element-states (revealed / known-exit silhouette / stripped); DM notes stripped server-side; enemy affinities hidden during combat. **Status-branched** (draft / live / ended). |

---

## The four-entity model

The feature names a separation the combat tracker implied but never drew. Four entities — two new spatial primitives, and the two temporal layers that run over them:

- **Map** — reusable, **user-owned** authored geography. A template belonging to no campaign or dungeon: Zones, connections (with `hidden` / `locked` flags), the node `(x, y)` layout, and per-Zone player-facing descriptions + private DM notes. Authored on the My Maps surface; never holds runtime.
- **Map Instance** — a **per-run snapshot** of a Map's geometry that owns **all spatial runtime**. Minted when a Map is selected (for a dungeon, or for a standalone encounter). It is the **single spatial truth** the other layers render.
- **Dungeon** — the **exploration-time** layer over one Instance: the dungeon-turn loop, the delve's lifecycle, and the DM-only reminder settings. Owns **no** geometry.
- **Encounter** — the existing **combat-time** layer, repointed: turn order, the (now non-spatial) combatant overlay, enemy identity + vitals — **referencing** a Map Instance for position instead of owning it.

`Dungeon : exploration-time :: Encounter : combat-time`. Both are purely temporal; **the Instance owns every spatial transition** (`move → reveal`, `move → break-engagement`, enchant), and the temporal layers **invoke** those transitions rather than reimplementing them.

### What each entity owns

| Layer | State | Lifecycle |
| -- | -- | -- |
| **Map** (template) | Zones · connections + `hidden`/`locked` · node `(x,y)` · descriptions · DM notes | Durable, user-owned; edited only on My Maps |
| **Map Instance** (space) | **Geometry** (snapshot of the Map's, editable in Edit mode) · **occupancy** (tokens) · **reveal-state** (revealed Zones / revealed hidden connections / unlocked connections) · **engagement** · **enchantment** | Per-run; geometry persists across the run, engagement + enchantment are combat-scoped (pruned at combat-end) |
| **Dungeon** (exploration-time) | Turn counter · `actedCharacterIds` (this turn) · reminder settings · status (`draft`/`active`/`done`) · `campaignId` | Per-delve |
| **Encounter** (combat-time) | Turn order (`firstSide`/`advantage`/`round`/`currentActorId`) · the **non-spatial** combatant overlay (ailments, battle conditions + durations, reaction, side, `hasActedThisRound`) · enemy identity + inline vitals · `mapInstanceId` · status | Per-fight; ephemeral, dies with the session |
| **Character row** | `currentHP` / `currentSP` / `exhaustion` | Persistent across encounters |

No value is dual-homed — the property the tracker ADR established, extended across the spatial split. In particular **the delve roster is not stored**: it *is* the set of **PC tokens on the Instance** (placing a token adds a character to the delve; pruning it removes them). The Dungeon's turn-loop holds only *which* of those characters have acted this turn (`actedCharacterIds`) — temporal state keyed by `characterId`, distinct from the Encounter's per-combatant `hasActedThisRound` (different mode, different unit; a character never acts in both at once).

### Every Encounter references an Instance; the Dungeon is optional

Position is never a property of a character or a combatant — it is always a **token in some Map Instance's occupancy**. So **every Encounter references a Map Instance**: a one-off skirmish mints its own (from a template, or authored ad hoc, in encounter setup — this replaces today's inline zone authoring on the `CombatSession`); a dungeon encounter **reuses the dungeon's Instance**. The Dungeon is the optional layer. An Instance is driven by a Dungeon (a delve), or by an Encounter alone (a standalone fight), or — during dungeon combat — by **both at once**. That last case is the shared row the concurrency model is built around: **one Instance is referenced by at most one Dungeon and at most one live Encounter.**

### PC and enemy decompose the same way

A combatant is a **position + a vitals source + a non-spatial overlay**, and PCs and enemies differ on exactly one axis — the same one they already differed on:

| Combatant kind | Position | Vitals source | Non-spatial overlay |
| -- | -- | -- | -- |
| **PC** | token on the Instance, keyed by `characterId` (**persistent** — outlives any one encounter) | the **character row** | on the Encounter combatant |
| **Enemy** | token on the Instance, keyed by `combatant.id` (**ephemeral** — dies with the session) | inline statblock **on the combatant** | on the Encounter combatant |

The occupant key *is* the join between a token and the combat state held elsewhere — which is what lets PC tokens persist while enemy combatants are ephemeral. **Engagement and enchantment are spatial and live on the Instance for both kinds** (see _Engagement & enchantment on the Map Instance_); only the vitals source differs — the one axis that already differed in the shipped tracker.

---

## The spatial refactor (§0)

Milestone 0 is a **behavior-preserving refactor of the shipped combat tracker**, and the gate for everything downstream: the temporal layers can't sit over a Map Instance until the spatial state has been lifted out of the `CombatSession` to create one. It ships **no new player-visible behavior** — combat plays identically — and is done when the existing combat suite passes green reading position from the Instance.

### What moves off the `CombatSession`

| Today on the session/combatant | Moves to | As |
| -- | -- | -- |
| `session.zones`, `session.adjacency` | Map Instance | geometry (the zone graph) |
| `combatant.zoneId` | Map Instance | occupancy — a **token** `{ zoneId, occupant }` |
| `combatant.engagement` | Map Instance | engagement (a relation over co-located tokens) |
| `session.enchantment` | Map Instance | per-Zone enchantment (+ Forte) |

Everything else **stays** — it is non-spatial combat state: turn order (`firstSide` / `advantage` / `round` / `currentActorId`), the per-combatant overlay (ailments, battle conditions + durations, reaction, `side`, `hasActedThisRound`), the Shift chain, enemy identity + inline vitals, and status. The session **gains one field, `mapInstanceId`** — the reference to its spatial truth.

This is a **larger cut than the PRD's §0**, which moves only `zones` / `adjacency` / `zoneId` and has the combatant "retain its overlay and engagement." This ADR moves **engagement and enchantment too** (Decision 3), because they are spatially-determined and co-locating them with occupancy makes a combat move a single-row write. See _Engagement & enchantment on the Map Instance_.

### Schema delta

§0's persistence change is exactly: introduce **`map_instances`** (the extracted spatial state, a versioned jsonb row) and add **`encounters.mapInstanceId`** — **non-null**, since every encounter references an Instance and there are no legacy rows to leave dangling (see _No migration_). The `maps` template table and the `map_instances.mapId` back-reference arrive with authoring (M1); §0-era Instances are **template-less** (`mapId` null) — authored ad hoc inside encounter setup. Full DDL and rollout in _Persistence & concurrency_ and _Database & rollout_.

### No migration — existing encounters are disposable

§0 ships on `feature/dungeons` and reaches prod only when the whole feature merges — **well after the Friday playtest** — and existing encounters are **disposable** (a deliberate ruling: no production encounter data is worth preserving across the cutover). So §0 carries **no migration backfill**. The cutover **truncates `encounters`**, and the idempotent seed re-creates the showcase encounters under the new model (each minting its Map Instance). This is what lets `encounters.mapInstanceId` be non-null from the start — no legacy rows to leave dangling. Wiping is safe precisely because the destructive step lands long after Friday, on a feature merge the DM controls, never racing a playtest.

### Encounter setup now authors onto the Instance

With zones off the session, **encounter setup mints the Instance and places tokens** — this *replaces* today's inline zone authoring on the `CombatSession`. A standalone fight authors its geography ad hoc here (or, post-M1, picks a Map template); PC tokens are placed in setup, enemy tokens at combat start. The combat console reads position / engagement / enchantment from the Instance; the reducer is repointed (see _Reducer topology_) but its outputs are unchanged.

### Why it gates everything

The Dungeon, the exploration loop, fog-of-war, and dungeon-combat all assume a Map Instance exists to layer over. Until the spatial state lives on an Instance — addressable, shared, with its own reducer — there is nothing for the temporal layers to invoke. So behavior parity is the acceptance bar: the contract-test smoke layer (`__contract__`, real-catalog combat) passes unchanged, and the standalone-encounter E2E (cast / heal / move) is green, before any temporal layer lands.

---

## Engagement & enchantment on the Map Instance

The combat overlay splits. The PRD keeps **engagement** on the combatant ("orthogonal to position"), and the current `CombatSession` keeps **enchantment** as a zone-keyed map on the session. This ADR moves **both onto the Map Instance**, with occupancy and reveal-state — they are the *spatially-determined* slice of combat state, and putting them where the spatial entities live is what makes a combat move a single-row write.

### They are combat-scoped *and* spatial — verified against the rules

| | Combat-scoped? | Spatial? |
| -- | -- | -- |
| **Engagement** (§3.5) | "At any moment **in combat**, a character is either Engaged … or Free." | "A character becomes Free … because they are Fallen, Dead, or **have otherwise left the Zone**." — leaving a Zone breaks it. |
| **Enchantment** (Bard) | "**All Enchantments end when combat ends**." | "The Enchantment is **created in the Zone it targets**." — a per-Zone property. |

Both exist only during a fight and are anchored to Zones — exactly the profile that belongs on the Instance: a spatial home, pruned at combat-end.

### "Orthogonal to position" conflated two things

Pulling the PRD's phrase apart:

- **Not *derivable* from position** — true. Two tokens sharing a Zone aren't necessarily locked; the DM picks. Engagement is independent *data*, not a function of occupancy.
- **Not *coupled* to position** — false. It has a same-Zone precondition (you can only Engage a co-occupant) and a hard transition (leaving the Zone makes you Free).

So engagement is **independent data with a spatial invariant**: `engagement ⊆ same-Zone token pairs`. The place to maintain an invariant between two pieces of state is the reducer that owns both. Split them — occupancy on the Instance, engagement on the Encounter — and every move must write both rows to keep the invariant true; *that* is the combat-move cross-write. Co-locate them and it collapses to one row, with the `move → break-engagement` rule in the same function as `move → reveal` (both are movement events mutating Instance state).

### The model

- **Engagement** is a relation over co-located tokens — mutual, possibly one-to-many (a swordsman beset by two enemies is Engaged with both). It rides occupancy: a token's engagements are cleared by the same `reduceMapInstance` transition that moves it out of a Zone, by Disengage, and by Fallen/Dead. PC tokens persist across the delve, but an engagement involving an enemy token is pruned when that enemy is — folded into the combat-end enemy-token cleanup.
- **Enchantment** is a per-Zone effect carrying a **Forte** level (`f → ff → fff`, cap 3; a Zone re-Enchanted with the same type raises Forte). It lives on the Zone in the Instance and ends at combat-end.

### Lifecycle: empty in exploration, pruned at combat-end

These are the one place the Instance carries *combat-scoped* fields. During exploration they are simply empty (no fight ⇒ no engagement, no enchantment). At combat-end the Instance prunes them alongside the enemy tokens it already removes — one cleanup, one row. This is the cost of Decision 3, accepted in exchange for the single-row combat move; it is small because the prune co-occurs with work the Instance does anyway.

### Writer vs. home during combat

Co-locating engagement with occupancy does **not** hand movement authority to the spatial layer during a fight. The **Encounter's movement model still computes** the move — legality, opportunity-attack and interception prompts, engagement consequences (guided-but-overridable), reading both the Instance and the session — then **invokes the Instance's spatial transition to apply** the occupancy + engagement write. Reads span layers freely; only the write needs a guard, and it is one row. See _Reducer topology_.

### Open: Enchantment cardinality

The Enchantment rule reads *"Only one Zone can be Enchanted at any one time; if you Enchant a second Zone, the first one loses its Enchantment"* — ambiguous on whether the cap is **per-Bard** (each Bard maintains one Enchanted Zone) or **global** (one Enchanted Zone in the whole fight). It doesn't affect the home (per-Zone on the Instance either way); it's a `reduceMapInstance` rule to pin down at implementation. Tracked in _Open questions remaining_.

---

## Persistence & concurrency

_[To be written — the tables (maps / map_instances / dungeons / encounters.mapInstanceId); per-row versioning; the atomicity model (design-away by default + `guardMany` transaction for the ~4 rare lifecycle gestures); why the Instance is its own table (shared by Dungeon + a live Encounter).]_

---

## Reducer topology

_[To be written — reduceMapInstance / reduceDungeon / repointed reduceCombatSession; how the temporal layers invoke spatial transitions ("the move event delegates the spatial part to the Instance"); the writer-vs-home seam during combat (encounter movement model computes legality, Instance applies the write).]_

---

## Combat on the dungeon

_[To be written — enemies onto the live Instance; whole-map play; movement authority (free-drag in exploration vs the encounter movement model in combat, guided-but-overridable); combat-end cleanup (prune enemy tokens + engagement + enchantment, persist PC positions, mark the consumed dungeon turn).]_

---

## Console topology & surfaces

_[To be written — the one `/dungeon/[shortId]` route; the Edit ⇄ Play mode toggle (status vs mode as orthogonal axes; mode is DM-local ephemeral UI); in-run geometry editing in v1 with destructive-edit guards; the My Maps template editor; `/c/dungeon/[shortId]` player view; the dungeons list + create dialog on the campaign page; status-branched player view.]_

---

## Rendering substrate

_[To be written — React Flow rationale (DOM/SVG renderer ⇒ rich React nodes + an accessible tree, the two requirements that point the same way); MIT core, lazy island; the two gating spikes (token-drag-along-adjacency; the a11y graph-keyboard / aria-live pass); the SVG + d3-zoom escape hatch; the rejected options (Cytoscape — abandoned React wrapper; Sigma — WebGL fights a11y).]_

---

## Transport

_[To be written — reuse the Ably invalidation-ping; new dungeon + map-instance channels; the watch view dual-subscribes (encounter + instance) while combat is live, because a combat move now pings the Instance channel; polling fallback unchanged; channel naming via the env-namespaced server-owned helper.]_

---

## Player view: redaction & snapshot

_[To be written — the redacted Instance projection (undiscovered Zones hidden, unrevealed hidden connections invisible, DM notes stripped, enemy affinities hidden during combat); the three element-states; the polled snapshot API; status-branching; self-identification; the combat composition (own-sheet column + "Combat — Round N" signal).]_

---

## Database & rollout

_[To be written — migration inventory (additive: maps / map_instances / dungeons + encounters.mapInstanceId + the encounter-zone migration); expand/contract sequencing; the destructive vs additive split; migrate-on-deploy considerations.]_

---

## Impact on already-shipped code

_[To be written — reduceCombatSession sheds zoneId + engagement + enchantment handling; combatantSchema changes; the /combat page + EncounterSetup repoint onto a Map Instance; the watch snapshot projector reads position/engagement/enchantment from the Instance; zoneEnchantmentEffects repointed; the standalone-encounter pain-fix that falls out of §0 + Edit mode.]_

---

## Milestones & ticket-shape impact

_[To be written — map to the PRD's M0–M6, with the revision: v1 gains **in-run Instance geometry editing** (the Edit-mode toolset); structured-content editing (markers, monster spawns) stays M6. The engagement/enchantment move enlarges M0.]_

---

## Open questions remaining

_[To be written — shared/published map catalog (later); structured Zone features (M5); multi-floor dungeons (later); the Enchantment one-at-a-time cardinality (per-Bard vs global); migrate-on-deploy mechanism.]_

---

## PRD deltas (to apply)

_[To be written — the PRD lines this ADR revises: "engagement is orthogonal to position / the combatant keeps engagement" → engagement moves to the Instance; the enemy-decomposition split; "no in-dungeon authoring" → the Edit/Play mode toggle + in-run geometry editing in v1; M6 scope narrowed to structured-content editing.]_
