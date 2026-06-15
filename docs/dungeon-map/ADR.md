# ADR: Dungeon Map Architecture

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here.

**Status:** Draft · **Owner:** Jackson · **Date:** 2026-06-14
**Builds on:** [Initiative Tracker ADR](../initiative-tracker/ADR.md) (Campaign, the combatant overlay, the `CombatSession`) · [Real-Time Data Strategy ADR](../realtime/ADR.md) (the Ably invalidation-ping transport)
**Related:** [Dungeon Map — PRD](./PRD.md)

---

## Context

The combat tracker is shipped (see the [Initiative Tracker ADR](../initiative-tracker/ADR.md)): a **Campaign** is the DM↔player boundary, and an **Encounter** holds the whole combat runtime in one `session` jsonb — turn order, the per-combatant overlay, **and the spatial state: `zones`, `adjacency`, every `combatant.zoneId`, `engagement`, and the Bard `enchantment`**. The pure `reduceCombatSession(session, event) → session'` is the sole writer; a read-only player watch view polls a server-redacted snapshot; and a [realtime invalidation-ping layer](../realtime/ADR.md) (Ably) nudges clients to refetch.

The [PRD](./PRD.md) asks for a DM tool to author and run multi-room dungeons: a reusable **Map** template, instantiated per run as a **Map Instance**, with a **Dungeon** (exploration) and the existing **Encounter** (combat) as temporal layers over it; a fog-of-war player view; and combat that runs *on the dungeon* rather than in a copied arena. The PRD fixes the model and explicitly defers the technical design — data model, migration, reducer topology, atomicity, rendering substrate — to this ADR.

**The premise this ADR adopts, and extends past the PRD:** the Map Instance is the **single spatial truth**, and **all spatially-determined state lives on it — occupancy, reveal-state, _and_ engagement and enchantment.** That extension is the through-line: it makes a combat move a single-row write, collapses the atomicity question, and fixes the M0 cut.

**What stands from the PRD:** the three-runtime-layer model over a reusable Map; snapshot isolation (Instance edits never touch the template; template edits never reach live Instances); fog and reveal-state on the Instance; the polled, redacted, signed-out-visible player view; combat-on-the-dungeon with no copied graph; DM-driven movement; an abstract node-graph (not a tile/VTT map); reminders as pure selectors over the turn counter.

**What this ADR revises:**

- **Engagement and enchantment move to the Instance** (the PRD puts engagement on the combatant; enchantment is the shipped `CombatSession` singleton the PRD never names) — _Engagement & enchantment on the Map Instance._
- **The console gains an Edit ⇄ Play mode toggle with in-run geometry editing in v1** (the PRD defers all Instance editing to M6) — _Console topology & surfaces._
- **Existing encounters are disposable** — the cutover truncates and reseeds rather than backfilling — _The spatial refactor (M0)._

These three are the PRD positions this ADR *overturns*; the full reconciliation checklist — these plus the resolved open questions — is _PRD deltas (to apply)_ at the end.

---

## Decision summary

| # | Decision | Choice |
| -- | -- | -- |
| 1 | **The model** | **Four entities: Map / Map Instance / Dungeon / Encounter.** A **Map** is a reusable, user-owned authored template; selecting one mints a **Map Instance** — a per-run snapshot that owns all spatial runtime. A **Dungeon** (exploration-time) and the existing **Encounter** (combat-time) are purely temporal layers over one Instance. The Instance is the single spatial truth; the temporal layers **invoke** its spatial transitions, never reimplement them. |
| 2 | **Spatial refactor (M0, prerequisite)** | Lift `zones` / `adjacency` / `combatant.zoneId` **+ engagement + enchantment** off the `CombatSession` onto the Map Instance. Existing encounters are disposable — **truncate + reseed, no backfill** (the destructive step rides the feature merge, long after Friday). **Combat behavior unchanged** — this is a refactor, and the gate for everything else. |
| 3 | **Engagement & enchantment home** | **On the Map Instance**, with occupancy and reveal-state — **relocating the shipped shapes, not re-modelling** (engagement stays the per-combatant `targetCombatantIds` list; enchantment stays the global singleton). Both are verified **combat-scoped + spatially-located** (engagement breaks on leaving a Zone; enchantment is zone-anchored and ends with combat), so they prune at combat-end. Co-locating engagement with occupancy makes a **combat move a single-row write** and keeps the `move → break-engagement` rule in the same reducer as `move → reveal`. |
| 4 | **Persistence** | `maps` (user-owned template, geometry jsonb, `version`) + `map_instances` (per-run snapshot: geometry + occupancy + reveal + engagement + enchantment, `version`) + `dungeons` (`campaignId`, exploration-state jsonb, `version`). `encounters` **gains `mapInstanceId`** and **drops** inline `zones`/`adjacency`/`enchantment` plus each combatant's `zoneId`/`engagement`. |
| 5 | **Concurrency & atomicity** | Per-row optimistic `version` guards (one per table, the shipped `version-guard` pattern); **`guardMany`** composes them in a transaction for the few genuinely-atomic, confirm-gated gestures. Cross-container writes are **designed away** elsewhere — **no per-move transaction**. (Details: _Persistence & concurrency_.) |
| 6 | **Reducer topology** | `reduceMapInstance` (every spatial transition: `move → reveal`, `move → break-engagement`, enchant, **and the Edit-mode geometry edits**) · `reduceDungeon` (the turn loop) · `reduceCombatSession` **repointed** to read position from the Instance instead of owning `zoneId`. Purity holds; statefulness stays in the DB and React. |
| 7 | **Combat on the dungeon** | Enemies are **placed onto the live Instance** + a turn loop layered over it — no carved sub-graph, no copy; the whole map is in play (kiting). Movement authority is mode-dependent (free-drag in exploration; the Encounter's movement model once live). Combat-end prunes enemy tokens + engagement + enchantment, keeps PC positions, advances the turn. (Details: _Combat on the dungeon_.) |
| 8 | **Console topology** | **One `/dungeon/[shortId]` route with an Edit ⇄ Play mode toggle, orthogonal to lifecycle status** (`draft` / `active` / `done`). Edit mode = the full builder toolset on the Instance, available **regardless of status** (in-run geometry editing ships in v1; destructive edits guarded). Map **template** authoring lives on a separate user-owned **My Maps** editor. |
| 9 | **Rendering substrate** | **React Flow (`@xyflow/react`, MIT core)**, behind a lazy `"use client"` island. Two spikes gate the commit: **token-drag-along-adjacency** and the **graph-keyboard / aria-live accessibility pass**. **Hand-rolled SVG + `d3-zoom`** is the documented escape hatch. |
| 10 | **Transport** | Reuse the **Ably invalidation-ping**. A new `dungeon:{shortId}` channel; while combat is live the dungeon player view subscribes to **both** the dungeon and the live `encounter:{shortId}` channel (the Instance has no channel of its own). Polling stays the degraded-mode fallback. No new infra. |
| 11 | **Player view** | A **redacted Instance projection**, polled (~1.5s), signed-out-visible. Three element-states (revealed / known-exit silhouette / stripped); DM notes stripped server-side; enemy affinities hidden during combat. **Status-branched** (draft / live / ended). |
| 12 | **Authorization** | **Map writes gate on the owner** (`requireMapOwner` ≅ the shipped `requireOwner`); **Map Instance + Dungeon writes gate on the campaign DM** (`requireCampaignDM`, resolved via the referencing Dungeon/Encounter for an Instance). The DM console loads through `getDungeonForDM` (≅ `getEncounterForDM`, 404-collapsing); the player view is public + redacted. **Map ownership and Instance authority are independent** — editing an Instance never requires owning its Map. |

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
| **Enemy** | token on the Instance, keyed by `combatant.id` (**ephemeral** — dies with the session) | inline statblock **on the combatant**, or a `catalog-enemy` key resolved at runtime (`ref` is a 3-arm union: `pc`/`enemy`/`catalog-enemy`) | on the Encounter combatant |

The occupant key *is* the join between a token and the combat state held elsewhere — which is what lets PC tokens persist while enemy combatants are ephemeral. **Engagement and enchantment are spatial and live on the Instance for both kinds** (see _Engagement & enchantment on the Map Instance_); only the vitals source differs — the one axis that already differed in the shipped tracker.

---

## The spatial refactor (M0)

M0 is a **behavior-preserving refactor of the shipped combat tracker**, and the gate for everything downstream: the temporal layers can't sit over a Map Instance until the spatial state has been lifted out of the `CombatSession` to create one. It ships **no new player-visible behavior** — combat plays identically — and is done when the existing combat suite passes green reading position from the Instance.

### What moves off the `CombatSession`

| Today on the session/combatant | Moves to | As |
| -- | -- | -- |
| `session.zones`, `session.adjacency` | Map Instance | geometry (the zone graph) |
| `combatant.zoneId` | Map Instance | occupancy — a **token** `{ zoneId, occupant }` |
| `combatant.engagement` | Map Instance | engagement — the **same** shipped `{status, targetCombatantIds}` shape, now riding the token (relocation, not re-model) |
| `session.enchantment` | Map Instance | enchantment — the **same** shipped global-singleton `ZoneEnchantment \| null`, relocated |

Everything else **stays** — it is non-spatial combat state: turn order (`firstSide` / `advantage` / `round` / `currentActorId`), the per-combatant overlay (ailments, battle conditions + durations, reaction, `side`, `hasActedThisRound`), the Shift chain, enemy identity + inline vitals, and status. The session **gains one field, `mapInstanceId`** — the reference to its spatial truth.

This is a **larger cut than the PRD's FR-0** (Functional Requirement 0), which moves only `zones` / `adjacency` / `zoneId` and has the combatant "retain its overlay and engagement." This ADR moves **engagement and enchantment too** (Decision 3), because they are spatially-determined and co-locating them with occupancy makes a combat move a single-row write. **But it relocates the shipped representations, it does not re-model them** — engagement stays the per-combatant `targetCombatantIds` list (symmetric mirror-writes preserved), enchantment stays the global singleton; any richer shape (a per-Zone enchantment map, a relation-style engagement graph) is a deliberate *post-M0* change kept out of the parity-gated lift. See _Engagement & enchantment on the Map Instance_.

### Schema delta

M0's persistence changes are: introduce **`map_instances`** (the extracted spatial state, a versioned jsonb row); **drop** the migrated spatial columns (`zones`/`adjacency`/`enchantment` from `session`, `zoneId`/`engagement` from combatants — the _What moves off_ table); **truncate + reseed** `encounters` (_No migration_); and add **`encounters.mapInstanceId`** — **non-null**, since after the truncate there are no legacy rows to leave dangling. The `maps` template table and `map_instances.mapId` back-reference arrive with authoring (M1), the `dungeons` table with the exploration run (M2); M0-era Instances are **template-less** (`mapId` null), authored ad hoc inside encounter setup. Full DDL, step ordering, and rollout in _Database & rollout_.

### No migration — existing encounters are disposable

M0 ships on `feature/dungeons` and reaches prod only when the whole feature merges — **well after the Friday playtest** — and existing encounters are **disposable** (a deliberate ruling: no production encounter data is worth preserving across the cutover). So M0 carries **no migration backfill**. The cutover **truncates `encounters`**, and the idempotent seed re-creates the showcase encounters under the new model (each minting its Map Instance). This is what lets `encounters.mapInstanceId` be non-null from the start — no legacy rows to leave dangling. Wiping is safe precisely because the destructive step lands long after Friday, on a feature merge the DM controls, never racing a playtest.

### Encounter setup repoints onto the Instance

With zones off the session, **encounter setup writes its geography to the Instance** instead. M0 keeps today's `ZonesPanel` UI and simply **repoints its write target** — a required call-site update, since the `session` column it wrote is gone — and **mints the Instance + places tokens**; the node-graph **canvas replaces `ZonesPanel` in M1**, not here. A standalone fight still authors its geometry ad hoc here; PC tokens are placed in setup, enemy tokens at combat start. The combat console reads position / engagement / enchantment from the Instance; the reducer is repointed (see _Reducer topology_) but its outputs are unchanged.

### Why it gates everything

The Dungeon, the exploration loop, fog-of-war, and dungeon-combat all assume a Map Instance exists to layer over. Until the spatial state lives on an Instance — addressable, shared, with its own reducer — there is nothing for the temporal layers to invoke. So behavior parity is the acceptance bar: the **engine spatial unit suite** (`zones`/`placement`/`engagement`/`enchantment`/`zone-graph` — ~930 lines of unit specs) **plus** the larger `__integration__` shaper specs (which also assert the current shapes and need rewriting) and the **`__contract__` smoke layer** (real-catalog combat) pass green reading position from the Instance, and `encounter-shell.spec.ts` still passes. **Caveat:** `moveCombatant` has **no** E2E today (the cast/heal E2Es exercise the character sheet, not an encounter), so M0 must *add* a token-move test — its own riskiest path — rather than lean on one that doesn't exist.

---

## Engagement & enchantment on the Map Instance

The combat overlay splits. The PRD originally kept **engagement** on the combatant (the now-corrected *"orthogonal to position"* framing), and the shipped `CombatSession` keeps **enchantment** as a single zone-anchored `ZoneEnchantment | null` singleton on the session. This ADR moves **both onto the Map Instance**, with occupancy and reveal-state — they are the *spatially-determined* slice of combat state, and putting them where the spatial entities live is what makes a combat move a single-row write.

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

- **Engagement** keeps its **shipped representation** — the per-combatant `Engagement = {status:"free"} | {status:"engaged", targetCombatantIds}`, kept symmetric by mirror-writes in the reducer slices (`reduce/{engagement,placement,round}.ts`) over the `engagement-graph.ts` primitives — now **riding the token** instead of the combatant. Mutual, possibly one-to-many (a swordsman beset by two enemies is Engaged with both). A token's engagements are cleared by the same `reduceMapInstance` transition that moves it out of a Zone, by Disengage, and by Fallen/Dead; an engagement to an enemy token is pruned when that enemy is (combat-end cleanup, **and the `removeCombatant` case** — see _Reducer topology_ / _Atomicity_).
- **Enchantment** keeps its **shipped representation** — the **global singleton** `ZoneEnchantment | null` (`{zoneId, type, forte}`; re-Enchanting overwrites, same-Zone+type raises Forte `f → ff → fff`, cap 3) — relocated to the Instance, ending at combat-end. **It is not display-only:** `zoneEnchantmentEffects` folds into PC stat derivation (the Attack-Roll/affinity fold), so re-homing it also repoints the PC-hydration read sites.

### Lifecycle: empty in exploration, pruned at combat-end

These are the one place the Instance carries *combat-scoped* fields. During exploration they are simply empty (no fight ⇒ no engagement, no enchantment). At combat-end the Instance prunes them alongside the enemy tokens it already removes — one cleanup, one row. This is the cost of Decision 3, accepted in exchange for the single-row combat move; it is small because the prune co-occurs with work the Instance does anyway.

### Writer vs. home during combat

Co-locating engagement with occupancy does **not** hand movement authority to the spatial layer during a fight. The **Encounter's movement model still computes** the move — legality, opportunity-attack and interception prompts, engagement consequences (guided-but-overridable), reading both the Instance and the session — then **invokes the Instance's spatial transition to apply** the occupancy + engagement write. Reads span layers freely; only the write needs a guard, and it is one row. See _Reducer topology_.

### Enchantment cardinality — keep the shipped singleton

The shipped code already resolved this: `session.enchantment` is a **global singleton** (`ZoneEnchantment | null`, overwrite-on-reenchant), matching the rule's plain reading (*"only one Zone Enchanted at any one time"*). M0 **keeps that** — one enchanted Zone, relocated to the Instance. A richer model (per-Bard, so two Bards could enchant two Zones, i.e. a per-Zone map) is a deliberate **future re-model**, not a M0 change. Tracked in _Open questions remaining_.

---

## Persistence & concurrency

### The tables

Three new tables; one altered.

- **`maps`** — the user-owned template. `id`, `userId` (owner fk), `shortId` (the My Maps URL), `name`, `geometry` (jsonb: Zones, connections + `hidden`/`locked`, node `(x,y)`, descriptions, DM notes), `version`, timestamps. Edited only on My Maps; holds no runtime.
- **`map_instances`** — the per-run spatial truth. `id`, `mapId` (**nullable** fk → `maps`; null when authored ad hoc), `state` (jsonb: the geometry snapshot **+** occupancy + reveal-state + engagement + enchantment — one nested object, mirroring how the encounter persists its session), `version`, timestamps. **No `shortId`** — an Instance is reached through the Dungeon or Encounter that references it, never a public URL of its own.
- **`dungeons`** — the exploration layer. `id`, `campaignId` (fk), `shortId` (for `/dungeon/{shortId}` + `/c/dungeon/{shortId}`), `name`, `mapInstanceId` (fk — the delve's Instance), `status` (`draft`/`active`/`done`), `state` (jsonb: turn counter, `actedCharacterIds`, reminder settings), `version`, timestamps.
- **`encounters`** — **gains `mapInstanceId`** (non-null fk) and **drops** inline `zones`/`adjacency`/`enchantment` from its `session`, plus `zoneId`/`engagement` from each combatant.

The Instance `state` is one jsonb blob with one `version`, exactly as the encounter `session` is — geometry-vs-runtime is a *logical* split, not separate columns. At table scale (dozens of Zones) rewriting the blob per move is fine; it's the shipped pattern. **Validate, don't assume:** the blob now also carries reveal-state + engagement + enchantment, rewritten every move, so confirm per-move write latency at ~100 Zones with realistic per-Zone notes (rides the rendering spike).

### Why the Instance is its own table

A Map Instance is referenced by **at most one Dungeon and at most one live Encounter** — and during dungeon combat, by **both at once**. Folding it into the Dungeon row would strand a standalone encounter (an Instance with no Dungeon); folding it into the Encounter would re-create the dual-home the tracker ADR eliminated and lose the persistence of PC positions across fights. A shared spatial truth needs a shared row.

### FK lifecycle & the shared-row invariant

Two things the four-entity model must nail down — both deferred by the first draft. The shipped schema is careful here (encounters cascade with their campaign; characters set-null), so the new FKs are explicit:

| FK | `onDelete` | Why |
| -- | -- | -- |
| `map_instances.mapId → maps` | **set null** | the Instance is a **snapshot**; deleting the template must not delete or alter a live/historical Instance — the isolation premise demands it survive as `mapId = null` |
| `dungeons.campaignId → campaigns` | **cascade** | a dungeon dies with its campaign, exactly as encounters do |
| `dungeons.mapInstanceId → map_instances` | **restrict** | the dungeon *owns* its Instance, but deletion order is **app-managed** (delete the Instance with the dungeon) so a live Encounter's `mapInstanceId` is never stranded |
| `encounters.mapInstanceId → map_instances` (non-null) | **restrict** | lifecycle is app-logic, not an FK rule: a **standalone** encounter's Instance is 1:1 and **app-deleted at encounter-end**; a **dungeon** encounter's Instance is shared and must **not** be deleted on combat-end — `restrict` stops an accidental orphaning |

**Standalone-Instance lifecycle.** A template-less Instance (1:1 with a standalone encounter) is **deleted by the app when that encounter ends**; a dungeon's Instance lives with the dungeon (it outlives the fights on it). The existing **live-encounter lifecycle lock** (`queries/encounter-lock.ts`) extends to dungeons — a dungeon can't be deleted while its encounter is live — so no delete race leaves a dangling non-null `encounters.mapInstanceId`.

**Enforcing the shared-row invariant** (*one Instance ↔ at most one live Encounter*). App-side, mirroring the shipped one-live-encounter-per-campaign guard (read-then-act; `load-encounter.ts` notes there is no DB uniqueness constraint "for MVP"). Because the combat-authority model leans on this invariant, **also add a partial unique index** — `CREATE UNIQUE INDEX … ON encounters (map_instance_id) WHERE status = 'live'` — as a cheap DB backstop against a TOCTOU double-go-live. (A Dungeon adopting a *standalone* Instance is likewise blocked app-side: an Instance's driver is fixed at mint, never re-parented.)

### Concurrency: per-row version guards

Each of `maps`, `map_instances`, `dungeons`, `encounters` carries its own `version`. The character [`version-guard`](../initiative-tracker/ADR.md) is **character-table-coupled** (keyed by `VersionClass`, returns `character-not-found`, fires a character ping) — encounters already use a **separate** `bumpEncounterVersionGuarded`, a deliberate non-reuse per its own docstring. So each new table gets **its own guard following the same pattern**, not the existing primitive; **`guardMany`** composes those per-table guards in one transaction. A write loads the row, reduces, persists version-guarded; the optimistic client mirrors with the same reducer. The realtime ping carries `(domain, id, version)` per row.

### Atomicity (Decision 5): design the cross-write away, transact the rest

Most gestures are single-row by construction:

| Gesture | Writes | Rows |
| -- | -- | -- |
| Normal move (costs no turn) | Instance occupancy | 1 |
| Reveal / hide / unlock | Instance reveal-state | 1 |
| **Combat move** (occupancy + engagement) | Instance | **1** (engagement-on-Instance) |
| Combat event (condition, enemy vitals, turn) | Encounter | 1 |
| Mark acted / advance turn | Dungeon | 1 |

A combat move stays one row **even when it provokes an opportunity attack or interception**: the provoked attack is a *prompt*, adjudicated as a separate combat event (its own single-Encounter write), never folded into the move — the tracker's track-don't-adjudicate rule (see _Reducer topology_). (PC **vitals** during combat are likewise a separate *character-row* write via the existing pools actions, not part of the Encounter event — which is why post-combat HP/SP carry over for free: they were never on the Encounter.)

The genuinely-atomic, multi-container gestures are **few, rare, and confirm-gated** — and they get one transaction composing per-row guards (a small **`guardMany`**, the one new primitive):

| Gesture | Writes |
| -- | -- |
| Delve start (place roster) | Dungeon + Instance |
| Combat start (enemies + tokens + status) | Encounter + Instance |
| Add combatant mid-fight (roster slot + place token) | Encounter + Instance |
| Combat end (end + prune + mark turn) | Encounter + Instance + Dungeon |
| Search-that-reveals (acted + reveal) | Dungeon + Instance |
| Remove combatant (roster slot + prune token & engagement) | Encounter + Instance |

No per-move transaction; the hot path stays single-row. The last row is the subtle one (the codebase sweep surfaced it): removing a combatant mid-fight drops its Encounter roster slot **and** prunes its token plus every survivor's engagement to it on the Instance — today `removeCombatant` does that engagement unlink inline (`reduce/round.ts`), so after the split the Encounter must invoke an Instance prune event inside the `guardMany`. Mid-fight **add**-combatant is its mirror (Encounter roster slot + Instance token + engagement), which is why it joins the table above. **Bonus:** combat *start* is today two non-atomic guarded writes — the session-save then the `draft → live` status flip, a documented stuck-`draft` recovery dance (`actions/encounter/events.ts:42-47`) — so folding it into `guardMany` retires that failure mode for free.

> **Implementation note:** `guardMany` runs its per-row guards inside one `@neondatabase/serverless` transaction — the **read-then-write-version-guard-in-a-transaction** pattern the codebase already ships (`writes/inheritance-slots.ts:69`, `writes/finalize.ts:104`), not new driver ground. The genuinely new work is composing **two** version-guarded writes across two rows and threading the transaction executor through `bumpEncounterVersionGuarded` (today it runs on the base `db`, `writes/encounter.ts:94`).

---

## Reducer topology

Three pure reducers, one of them existing-and-repointed; statefulness stays in the DB and React, never the engine.

- **`reduceMapInstance(deps)(instance, event) → instance'`** — owns **every spatial transition**: `move` (occupancy) with its `→ reveal` (entered Zone + non-hidden neighbors) and `→ break-engagement` (left Zone) consequences; `reveal`/`hide`/`unlock`; `engage`/`disengage`; `enchant`; and the **Edit-mode geometry edits** (`addZone`, `setAdjacency`, `toggleConnectionFlag`, `editDescription`, `repositionNode`, guarded `deleteZone`). One home for the move-rules and the geometry.
- **`reduceDungeon(deps)(dungeon, event) → dungeon'`** — the exploration turn loop: `markActed`, `advanceTurn`, status transitions. The reminders are **pure selectors over the turn counter** (random-encounter cadence, Exhaustion onset), not reducer state. The roster is **derived** from Instance tokens, so adding or removing a character is a **single** token op on the Instance; `actedCharacterIds` is filtered to the current roster at read-time (a stale id for a departed character is ignored), so a removal needs no second-row Dungeon write.
- **`reduceCombatSession(deps)(session, event) → session'`** — the **existing** reducer (real shape `reduceCombatSession(lookups, newId)(session, event)`), repointed: it no longer owns `zoneId`/`engagement`/`enchantment`. Legality selectors (whose turn, reaction, opportunity-attack/interception prompts) take the Instance's occupancy + engagement as **injected context** — the tracker ADR's inject-don't-store pattern — and the reducer writes only the non-spatial session.

### Temporal layers invoke spatial transitions

The principle the PRD names, made concrete in the impure shell:

- **Exploration move** — the DM free-drags; the shell calls `reduceMapInstance` directly. No Dungeon write (a normal move costs no turn).
- **Combat move** — `reduceCombatSession` checks legality and surfaces the move's **prompts** (a provoked opportunity attack, an interception offer), then **delegates the spatial write to `reduceMapInstance`**. The move writes **only the Instance** (occupancy + engagement) — never the session. A provoked OA or interception is **adjudicated separately**: the DM resolves it as an ordinary combat event with its own single-Encounter write, exactly as the tracker prompts rather than auto-applies. So the move is single-row; its consequences are follow-on events, not part of its write. Movement authority stays with the Encounter; the Instance is just where the write lands. (Single-row is a **design choice**, not a rules consequence: per the rules a move spends the Move Action — combatant-resident economy state that lives on the Encounter — but the app's Move Action is a **non-enforcing** DM tracking aid, flipped only by an explicit `setActionEconomy` event, never auto-consumed by `moveCombatant`. Auto-consuming it would re-introduce the cross-write.)
- **Search-that-reveals** — `reduceDungeon.markActed` + `reduceMapInstance.reveal`, composed in one `guardMany` transaction.

**The `CombatEvent` union splits — the structural core of M0.** Today `combatEventSchema` is one discriminated union driving `reduceCombatSession` (`foundation/encounter/session-event.ts`). M0 carves the **spatial events** (`ZoneGraphEvent`, `MoveCombatantEvent`, `EngagementEvent`, `EnchantmentEvent`) onto `reduceMapInstance` and leaves the non-spatial events on the session reducer, re-verifying that the `PLAYER_OVERLAY_EVENT_KINDS` player-write allow-list still covers only non-spatial kinds. (A compile-time `Equals<>` guard keeps `combatEventSchema` ↔ `CombatEvent` honest, but that allow-list is a **runtime** `.includes` array — **not** compiler-checked — so harden it with a `satisfies`/`Extract` subset assertion if the split must be compile-safe.) This event-union split, **not** the column move, is the load-bearing change.

Engine placement (`packages/game/src/engine/encounter/`): `reduceMapInstance` and `reduceDungeon` are new pure modules beside `reduce-session.ts`, **curried deps-first** (`reduce(deps)(state, event)` — the engine's port/composition-root convention), data-pure and fixture-tested per the package rubric; the `Statblock` derivers and the Fallen injection are untouched (Fallen has zero spatial coupling).

---

## Combat on the dungeon

Starting combat during a delve **places enemies onto the live Instance** — it does not carve a sub-graph or copy anything. The DM adds enemy combatants (catalog or free-entry, through the existing start-combat flow), drops their tokens onto Zones, declares advantage + first side, and the existing turn order proceeds. Combat runs over the **same Map Instance** the delve uses, so the **whole map is in play** (kiting across Zones) and the hidden/locked/fog rules hold automatically — there is exactly one spatial source.

### Movement authority is mode-dependent

The "mode" is the Instance's combat state, **not** a UI choice: if a **live Encounter references the Instance**, movement goes through its movement model; otherwise (exploration only) the DM free-drags. Since at most one live Encounter references an Instance, the authority is never ambiguous.

- **Exploration** — the DM moves tokens **freely** (`reduceMapInstance` direct), the party can split, a normal move costs no turn.
- **Combat** — occupancy is written **only through the Encounter's movement model**, so engagement, opportunity attacks, and interception are enforced (**guided-but-overridable** — the app flags an illegal move and the DM may override) rather than bypassed by a free drag. The console emits combat-move events, not free-drag events, while a fight is live.

### Combat end

Enemy tokens, engagement, and enchantment are **pruned from the Instance** (one cleanup, one row); PC tokens **persist** where they ended; the DM marks off the **dungeon turn the fight consumed** (§2.2) via a one-tap confirm. HP/SP already live on the character row, so post-combat state carries over for free. Combat-end is a three-container gesture (Encounter end + Instance prune + Dungeon turn) — one of the `guardMany` transactions.

A **standalone** fight is the same machinery with the Instance 1:1 to the encounter and no Dungeon.

---

## Console topology & surfaces

### One route, two orthogonal axes

The DM console is a single route, `/dungeon/{shortId}`, governed by two independent axes:

- **Status** (`draft` / `active` / `done`) — the delve's **persisted lifecycle**. Drives the player-view branch, whether the turn loop runs, and whether combat can start.
- **Mode** (`Edit` ⇄ `Play`) — **which tools the canvas exposes**, DM-local ephemeral UI (`useState`, not persisted), **orthogonal to status**. **Edit** = the full builder toolset on the Instance (add/rename/move Zones, draw/flag/delete connections, edit descriptions). **Play** = the run toolset (move tokens, reveal/unlock, turn loop, combat).

Because mode is orthogonal to status, the DM can drop into **Edit mid-`active`-delve** to wire a forgotten adjacency, then flip back to Play. The toggle also disambiguates the canvas's overloaded drag: in Edit, dragging a node **repositions** it; in Play, dragging **moves a token**.

### In-run geometry editing ships in v1

Edit mode writes Instance geometry through `reduceMapInstance`. **Non-destructive edits** (add a Zone, add/rename an adjacency, toggle a flag, edit text) are safe anytime, including mid-combat — "add a forgotten adjacency" is exactly this. **Destructive edits** (delete an occupied Zone/connection) are guarded by the PRD's existing block/relocate-with-confirm rule. This pulls the *geometry* slice of the PRD's M6 into v1; **structured-content editing** (markers, monster spawns) stays M6. It also fixes the shipped tracker's "can't edit in progress" pain as a side effect of M0 — a standalone encounter's live console gets the same Edit toggle.

### Surfaces

- **My Maps** — the user-owned template list + the Map editor (autosave). Reachable on its own; authoring a *template* is distinct from editing a delve's *Instance*.
- **Dungeons list + create dialog** — on the campaign page; the Map picker lists the DM's own Maps, with **New Map** authoring inline.
- **`/dungeon/{shortId}`** — the DM console (status-forked under the hood: `draft` = prep, `active` = run, `done` = summary; with the Edit/Play toggle).
- **`/c/dungeon/{shortId}`** — the read-only fog player view (status-branched).

One **shared canvas component** serves builder, console, and player view (route-agnostic) — "the same graph" as code.

---

## Authorization

Three write surfaces, three gates — each an existing helper or a one-file parallel of one, no new machinery. The rule tracks ownership: a **Map** is user-owned, so it gates on its owner; a **Map Instance** and a **Dungeon** belong to a campaign's delve, so they gate on the campaign DM.

| Surface | Gate | Mirrors |
| -- | -- | -- |
| **Map** writes (My Maps authoring) | **owner** — `map.userId === viewer`, else `forbidden()`. A new `requireMapOwner(mapId)` exactly parallels `requireOwner(characterId)` (`viewer-role.ts:57`). | character-sheet writes |
| **Map Instance** writes (geometry edits, occupancy, reveal, engagement/enchantment) | **campaign DM** — resolved through the entity that references the Instance (the Dungeon's, or the standalone Encounter's, `campaignId`), then `requireCampaignDM(campaignId)` (`campaign-access.ts`). The Instance has no `campaignId` of its own. | encounter writes |
| **Dungeon** writes (turn loop, status, reminder settings, roster-via-tokens) | **campaign DM** — `requireCampaignDM(dungeon.campaignId)`. | encounter writes |

**Map ownership and Instance authority are independent — by design.** Editing a Map (template) requires owning it; editing a Map Instance requires being the campaign's DM, **never** Map ownership. Today the two coincide — a DM can only import their *own* Maps into a dungeon (there is no Map sharing yet) — but keeping the gates separate is exactly what lets a future shared-Map catalog (_Open questions remaining_) work without rework: an imported Map's Instance is a **snapshot**, so the running DM edits the Instance under their campaign-DM authority while the template stays the owner's, untouched. This is the authorization face of the snapshot isolation the whole model already rests on — *editing a Map never reaches an Instance, and editing an Instance never requires the Map.* (It settles the PRD-review's open "Map-owner vs Dungeon-DM" question: the Instance gate is campaign-DM, full stop.)

**Console load gate.** `/dungeon/{shortId}` is DM-only and loads through a new `getDungeonForDM(shortId)` that **mirrors `getEncounterForDM`** (`encounter-access.ts:20`): `cache()`-memoized per request, returning `null` for *both* "not found" and "not your campaign" so the route 404s either way **without leaking that a dungeon exists**. `/c/dungeon/{shortId}` stays public/signed-out-visible — it serves only the server-redacted snapshot (see _Player view_), so it takes no gate.

The only judgement call here — which gate a Map Instance takes — is settled by ownership: the Instance is the campaign's, not the Map-owner's. Everything else is `requireOwner` / `requireCampaignDM` / `getEncounterForDM` reused or trivially mirrored.

---

## Rendering substrate

**Decision: React Flow (`@xyflow/react`, MIT core)**, behind a lazy `"use client"` island.

The two hardest requirements point the same way — at a **DOM/SVG renderer**:

- **Rich React node content.** A Zone node is a styled card (name, reveal/lock state, token occupancy); React Flow nodes *are* your React components, so shadcn + Phosphor + Tailwind render natively. Canvas/WebGL renderers (Cytoscape, Sigma) paint pixels — you'd rebuild that as draw calls.
- **Accessibility (a v1 requirement).** A DOM renderer has an accessible tree to work with; React Flow ships focusable nodes/edges, Tab/arrow traversal, Enter/Space activation, `ariaRole`/`ariaLabelConfig`, and a built-in `aria-live` region. Canvas (Cytoscape) and WebGL (Sigma) have **no DOM to make accessible** — they fight the requirement.

It also hands us, MIT and free, every built-in we'd otherwise hand-roll across three surfaces — pan/zoom, fit-view, touch/pinch, drag, drag-to-connect, even the deferred minimap — at ~58 KB gz, lazy-loaded so non-map pages don't pay. Our scale (dozens–low-hundreds of nodes) is trivial for a DOM renderer.

**Rejected:** **Cytoscape.js** (canvas; no accessible DOM; its React wrapper is abandoned — last release 2022, no React 18/19 declaration). **Sigma.js** (WebGL; actively fights every a11y requirement). **Hand-rolled SVG** (philosophically clean — zero lock-in, total a11y control — but re-implements pan/zoom/drag/connect/fit-view/touch across three surfaces, exactly the work React Flow deletes).

**Two spikes gate the commit** (plus a lightweight **perf check**: pan/zoom/drag + reveal stay smooth at ~100 Zones with realistic node content — well within a DOM renderer's range, but validated, not assumed)**:**

1. **Token-drag-along-adjacency** — snapping a token to an *adjacent* Zone (rejecting non-adjacent) is the one interaction React Flow doesn't give for free; build it on the run console and confirm it composes with `onNodeDrag` rather than fighting it.
2. **The a11y graph-keyboard / aria-live pass** — React Flow's arrow keys move a *node*, not traverse *edges*; our roving-tabindex Zone list + arrow-key adjacency traversal + per-Zone descriptions + reveal/move announcements layer on top, and the fog player view must keep unrevealed Zones out of the tab order and the a11y tree. Validate one screen-reader pass *before* committing — it's the requirement most likely to hit a wall.

**Escape hatch:** hand-rolled SVG + `d3-zoom` — the *node rendering* ports cheaply (each node/edge is already a plain React component we own), though the interaction plumbing (pan/zoom/drag/connect/fit-view) would be rebuilt. It's the clean fallback if the **token-drag** spike walls (an interaction-only gap). If the **a11y** spike walls, the mitigation is **not** chiefly this SVG fallback but the library-independent **roving-tabindex Zone list** layered on top — which works under either renderer.

---

## Transport

Reuse the shipped **Ably invalidation-ping** ([Real-Time ADR](../realtime/ADR.md)) wholesale — pings carry `(domain, id, version)`, clients refetch through the existing read paths, **zero new infra**. The additions:

- **A new `dungeon:{shortId}` channel.** Exploration writes — moves, reveals, turn-loop changes (Dungeon + Instance during exploration) — ping it. The dungeon player view subscribes to it.
- **The watch view dual-subscribes during combat.** A combat move is now an *Instance* write driven by the Encounter, so it pings the `encounter:{shortId}` channel (as combat events already do). The dungeon player view, which composes the combat watch while a fight is live, **subscribes to both `dungeon:{shortId}` and the live `encounter:{shortId}`** (it learns the encounter shortId from the snapshot) — the same multi-channel pattern the DM console already uses.
- **Channel naming** goes through the env-namespaced, server-owned helper (`lib/realtime/channels.ts`); the `dungeon` domain is added there. (`RealtimeDomain` is a **union, not a registry** — the new domain string must be added in lockstep across `channels.ts` (the union), the token-route enum, the **server-side publish helper** (a `publishDungeonPing` + its payload type/parser in `publish.ts`), and the client ping parser, or realtime silently falls back to polling-only.) Tokens stay subscribe-only; payloads stay advisory metadata.
- **Snapshot versions are composite — and the ping must say *which* version it carries.** A combat move bumps only `map_instances.version`, but clients decide refetch by comparing the *snapshot's* version, so `EncounterSnapshot` / the new `DungeonSnapshot` expose **both** their temporal-layer version (encounter/dungeon row) **and** their Instance's version, and a client refetches when *either* advances. **Sharp edge (from the codebase):** the shipped ping payload is `{version, status}` with **no entity tag**, and an Instance ping and an encounter ping land on the *same* `encounter:{shortId}` channel — indistinguishable, with two independent counters, so a naïve `<=` compare cross-wires (spurious refetch or dropped update). The ping must carry a **version-kind tag** (`encounter` vs `mapInstance`) so each is compared against the right ref. This is the same cross-aggregate-invalidation gap the **frontend audit flagged** ([REPORT.md](../frontend-audit/REPORT.md)) for PC-vitals-on-the-watch (a self-heal pings `character` but the watch only tracks `encounter`). It is **latent today** — nothing renders snapshot PC vitals — but the dungeon player view **activates** it by composing the own-character-sheet column during combat, so it must be fixed for this feature; polling masks it until then. The single-row *write* is preserved either way (the optimistic guard stays Instance-only).
- **The apply-side guard is a precondition, not a nicety.** The ping-tag + the second snapshot-version field are the *compare-before-fetch* half; the other half is the **apply** half. `useEncounterSnapshot` today applies fetch responses **without** a version guard or `AbortController` ([REPORT.md](../frontend-audit/REPORT.md)), so out-of-order refetches can regress the rendered snapshot — and adding a second counter *widens* that race. Treat all three as **one coordinated change**: a monotonic **composite-version apply guard** (+ `AbortController`) on the snapshot hook is a **precondition** of reusing the watch transport, not just the ping-tag fix.

**Polling remains the degraded-mode fallback**, unchanged — when realtime is unavailable the player view keeps its ~1.5s poll, and E2E asserts through the DB regardless.

---

## Player view: redaction & snapshot

The fog player view at `/c/dungeon/{shortId}` consumes a **server-redacted projection of the Map Instance**, polled (~1.5s) and realtime-pinged, signed-out-visible — reusing the encounter watch's transport and visibility model.

**Redaction stays server-side** (the realtime ADR's invariant). A new `projectDungeonSnapshot` strips, per element, into the PRD's **three states**:

- **Fully revealed** — Zone name, description, tokens.
- **Known-exit silhouette** — *that* an exit exists and *whether it's locked*, nothing more (no neighbor name/description/contents).
- **Stripped** — undiscovered Zones, unrevealed hidden connections, and DM notes are **absent from the payload**, not hidden client-side.

During combat the projection also **hides enemy affinities** (reusing the UNN-324 enemy redaction) while showing HP/SP.

**Status-branched** like the encounter watch: `draft` ("the delve hasn't begun") / `live` (the fog map) / `ended` (a frozen final reveal) — never a bare canvas. **Self-identifying:** tokens are labeled, and the viewer's own token(s) highlighted. A **spectator** — signed-out, or signed-in but owning no token in this delve — sees the **map only**; a **campaign member who owns token(s) here** gets **self-highlight** on those tokens.

**During combat** the view composes the encounter watch's **own-character-sheet column + a "Combat — Round N" signal**, with the dungeon map as the battlefield panel — no redirect. **During exploration** it shows only the day's **turn counter** (no turn queue; acted-flags stay DM-only). Served from a public `app/api/dungeon/{shortId}/snapshot` route, analogous to the encounter snapshot.

---

## Database & rollout

### Migration inventory

The migrations span **M0–M2**; only M0's are destructive (everything later is additive).

| Milestone | Migration | Kind |
| -- | -- | -- |
| **M0** | Create `map_instances`; **`TRUNCATE encounters`**; `ALTER encounters ADD mapInstanceId` **non-null**. (Removing `zones`/`adjacency`/`enchantment` from `session` + `zoneId`/`engagement` from combatants is a **jsonb shape change** — governed by `combatSessionSchema`, made moot by the truncate+reseed — not `ALTER…DROP COLUMN`; only `mapInstanceId` is real DDL.) | **Destructive** |
| **M1** | Create `maps`; add `map_instances.mapId` fk | Additive |
| **M2** | Create `dungeons` | Additive |

**M0 step order matters** (the one gotcha): **truncate `encounters` first**, *then* add the non-null `mapInstanceId` — adding a `NOT NULL` column to a populated table fails, so the truncate must precede it (both in the one M0 migration). The idempotent seed then reseeds the showcase under the new model, each encounter minting its Instance.

### Branch & sequencing

- **`feature/dungeons`** is a long-lived integration branch off `main`; per-epic branches (M0, M1…M6) merge into it; it merges to `main` **atomically when the feature is complete**. The visible dungeon feature never ships half-finished.
- **This ADR merges to `main` when finished** (docs, like the other two ADRs).
- **The Friday guarantee:** nothing dungeon-related reaches `main`/prod until the **atomic feature merge**, so **every** game night until then — this Friday's included — runs on the untouched prod tracker. The destructive M0 cutover rides that merge, on a deploy the DM controls, so it never races a playtest. (This is why "encounters are disposable" is safe: the truncate is a deliberate, controlled-deploy step, not a live migration.)
- **Divergence:** M0 refactors *live* tracker code, so parallel tracker work on `main` would conflict with the open branch. Here this is **low-risk** — the dungeon feature is the only active workstream, so there is nothing to run in parallel; "freeze `main`" is the default state, not a process to enforce. Should an urgent tracker hotfix land on `main` anyway, cherry-pick it onto `feature/dungeons` to keep the eventual merge clean.

Migrations run via `drizzle-kit migrate` over `DATABASE_URL_UNPOOLED`, as today; the idempotent seed re-creates the showcase under the new model on the feature merge.

### Rollback

Encounters are disposable, so the risk M0 must plan for is **not** data loss — it's the **combat code regressing in prod after the cutover**. The `TRUNCATE` is irreversible, so timing + a green parity suite are necessary but not sufficient; the recovery path is explicit:

1. **Before the M0 migration**, snapshot prod via a **Neon branch** (the per-PR Neon-branch infra already exists — [realtime ADR](../realtime/ADR.md)) — the restore point.
2. **If combat regresses post-cutover**, **revert the deploy** and restore from that branch; the showcase reseeds idempotently under whichever schema is live.

(Full **expand/contract** — ship M0 reading from the Instance while the legacy `session` fields still exist, then drop them in a later contract migration — is the heavier alternative. Given encounters are disposable, the snapshot + deploy-revert is sufficient and lighter.)

---

## Impact on already-shipped code

The spatial state is localized (the `packages/game/src/engine/encounter/` folder + `apps/web/components/combat/`), but a codebase sweep found the real consumer surface is **~40 production consumers** (the table below already enumerates the load-bearing set), not the headline few. The load-bearing changes:

| Artifact (path) | Change |
| -- | -- |
| **`CombatEvent` union split** (`foundation/encounter/session-event.ts`) | Carve the spatial events (`ZoneGraphEvent`/`MoveCombatantEvent`/`EngagementEvent`/`EnchantmentEvent`) out of `combatEventSchema` + `reduceCombatSession` onto `reduceMapInstance`; re-verify `PLAYER_OVERLAY_EVENT_KINDS`. **The structural core** (the `Equals<>` schema guard is compile-time; the player allow-list is a runtime `.includes` array — harden it). |
| `reduceCombatSession` + slices (`engine/encounter/reduce-session.ts`, `reduce/{zones,placement,engagement,enchantment,round}.ts`) | Spatial slices move to `reduceMapInstance`; session reads occupancy/engagement as injected context. **Cross-cuts to preserve:** `placement.moveCombatant` already does move→break-engagement (gets *easier* on the Instance); `zones.removeZone` clears enchantment; **`round.removeCombatant` unlinks survivor engagement** — now a cross-container prune (see _Atomicity_). |
| Engine **view-shapers** — `resolve-zone-layout.ts` (reads all five fields), `roster-view.ts`, `resolve-player-view.ts`, `resolve-engagement.ts`, `zone-graph.ts`, `setup-roster-view.ts` (`isRosterFullyPlaced` is also a server-side start-combat guard) | Re-pointed to take Instance **+** session as two inputs (the "reads span layers" case). The hot render path — and the biggest slice the first-draft impact list missed. |
| `combatantSchema` / `CombatSession` schema (`foundation/encounter/session.ts`) | Drop `zoneId`/`engagement` (combatant), `zones`/`adjacency`/`enchantment` (session); add `encounters.mapInstanceId`. The Drizzle conformance test covers character rows only, so the jsonb shape just follows the schema. |
| `projectPlayerSnapshot` (`engine/encounter/player-snapshot.ts`) + `loadOwnedEncounterSheets` + `useOwnedSheetZoneEffectsRefresh` (`components/combat/watch-sheet-refresh.ts`) | Read position/engagement/enchantment from the Instance; the client refresh hook diffs `enchantment`/`zoneId` **values** (not versions), so it must follow the reshape or owned sheets go stale. |
| `zoneEnchantmentEffects` (`engine/encounter/enchantment.ts`) → derive | **Not display-only** — folds into `derive-hydrated-character` → the Attack-Roll/affinity stat fold; re-homing repoints the PC-hydration sites (`app/combat/[shortId]/page.tsx` live branch, `load-encounter-snapshot.ts`). |
| `ZonesPanel` + ~12 combat UI components (`components/combat/`) | `ZonesPanel` repointed in M0 (canvas in M1); `zone-layout`, `engagement-control`, `combatant-position-section`, `zone-enchantment-control`, the rail/setup rows, `encounter-watch`, `combat-console`, … re-pointed to Instance shapes. |
| **New engine modules** | `reduceMapInstance`, `reduceDungeon` (curried deps-first, fixture-tested); `Statblock` + Fallen injection untouched. |
| **New app plumbing** | per-table guards + `guardMany`; `lib/realtime/channels.ts` gains a `dungeon` domain; `projectDungeonSnapshot` + the public snapshot route. |
| **Parity gate** | the engine spatial unit suite (~930 lines) + `__contract__` + `encounter-shell.spec.ts` — several specs assert the *current* shapes and need rewriting, not just re-running; **add a `moveCombatant` test** (none exists). |
| **Free win** | M0 + Edit mode gives the *standalone* combat console in-fight adjacency editing — the tracker's "can't edit in progress" pain, fixed as a side effect. |

**What's genuinely clean** (confirmed by the sweep): no range/distance/attack-resolution reads zones — the only zone→combat-math path is the enchantment effect fold; turn order and Fallen injection are fully non-spatial; `combatant.zoneId` has no DB-level FK today (`""` = unplaced), so the token model is a *tightening* to reconcile, not a data migration.

---

## Milestones & ticket-shape impact

| Milestone | Scope | Notes vs PRD |
| -- | -- | -- |
| **M0 — Spatial refactor** | Lift zones/adjacency/zoneId **+ engagement + enchantment** to the Instance; introduce `map_instances` + `encounters.mapInstanceId`; repoint `reduceCombatSession`; parity-gated. | **Enlarged** — engagement + enchantment move too. |
| **M1 — Map authoring** | `maps` table + My Maps editor + the node-graph builder on the React Flow canvas (replaces M0's repointed `ZonesPanel`); `mapId` FK. **The Edit-mode toolset lands here.** | — |
| **M2 — Exploration run** | `dungeons` table + `reduceDungeon` + the turn loop + reminders (selectors) + token placement + DM movement + reveal; Instance runtime. **Edit/Play toggle available in the run console.** | — |
| **M3 — Player fog view** | `/c/dungeon/{shortId}` + `projectDungeonSnapshot` + the polled/pinged transport. | — |
| **M4 — Combat integration** | Enemies onto the live Instance; whole-map play; combat-end cleanup + mark-the-turn. | — |
| **M5 — Structured Zone features** *(later)* | Markers (loot/monster/trap), monster→combatant spawn. | — |
| **M6 — Map reuse + structured-content editing** *(later)* | Library browser to pick saved Maps; editing **structured content** on a live Instance. | **Narrowed** — the *geometry*-editing slice moved into v1 (M1/M2). |

Each milestone is an epic; per-epic branches off `feature/dungeons`.

---

## Test plan

The M0 parity gate (_Why it gates everything_) covers the *refactor*; each **new** surface gets its own coverage, in the package's fixture-backed style (rubric in `__fixtures__/README.md`).

| Milestone | New tests |
| -- | -- |
| **M0** | **Add a `moveCombatant` E2E** — none exists today, and it is M0's own riskiest path; the spatial unit + `__integration__` + `__contract__` suites pass green reading position from the Instance. |
| **M2** | `reduceDungeon` unit (turn loop: `markActed` / `advanceTurn`; the reminder **pure selectors** — random-encounter cadence + Exhaustion-onset thresholds); `reduceMapInstance` unit (`move → reveal`, `move → break-engagement`); a **`guardMany` atomicity/rollback** test (one row's guard fails ⇒ **none** commit). |
| **M3** | A **`projectDungeonSnapshot` redaction test** asserting stripped fields are **absent** (not null) — DM notes, undiscovered Zones, unrevealed hidden connections, enemy affinities — mirroring `player-snapshot.integration.test.ts`; a **version-kind-ping** parse test. |

**`projectDungeonSnapshot` redaction is a release gate.** A regression there leaks DM-only content to the public player view, so it ships with the same structural-absence rigor as the shipped player snapshot — not as an afterthought.

---

## Open questions remaining

- **Enchantment cardinality (resolved for v1)** — keep the **shipped global singleton** (one enchanted Zone, relocated to the Instance). A per-Bard / per-Zone-map re-model (multiple enchanted Zones) is a future change, not v1.
- **Shared / published map catalog** — v1 Maps are user-owned templates; whether they later become shareable (a global catalog like the enemy catalog) is open.
- **Structured Zone features (M5)** — the content model (loot/monster/trap markers; monster→combatant spawn) is sketched, not designed.
- **Multi-floor dungeons** — one Map / one Instance per Dungeon in v1; multiple Maps per Dungeon is a later extension.
- **Standalone-encounter Map authoring UX** — v1 lets a one-off fight author geometry ad hoc (template-less Instance); whether to nudge toward saving it as a Map is open.
- **Migrate-on-deploy for the feature merge** — reuse the existing manual/automated prod-migration path; mechanism unchanged.
- **Canvas undo/history** — authoring autosaves with no explicit Save, so an accidental delete-Zone or mis-drawn adjacency needs a recovery story; the destructive-edit confirm is not undo. Mechanism open.
- **DM-console optimistic-conflict UX** — the shipped combat console's eager version-ref forwarding can silently drop a concurrent DM write ([REPORT.md](../frontend-audit/REPORT.md)); the dungeon console reuses that plumbing. Adopt a shared queued-write primitive vs. re-hand-roll — open.
- **Multi-DM / second tab** — the single-row-write model assumes one writer; whether a second concurrent DM session is supported or single-writer-by-convention is unspecified.
- **Player view during DM Edit-mode** — the snapshot contract while geometry changes mid-`active` delve (freeze vs. surfacing half-wired geometry / a just-deleted occupied Zone) is undefined.

---

## PRD deltas (to apply)

When this ADR is accepted, reconcile the PRD (✓ = already applied during review):

- ✓ **Engagement & enchantment → the Instance — applied.** The PRD body now models engagement as **mutual + same-Zone** (spatial; the rulebook-contradicting *"orthogonal to position"* line in the §3.5 Rules Recap is corrected) and homes engagement + the Bard enchantment on the Map Instance — swept across the glossary (Combatant / Engagement / new Enchantment entry), Architecture (the Map-Instance & Encounter layer bullets, the single-spatial-truth and enemy-decomposition paragraphs), Rules Recap (Zones §3.5 + Combat geometry), PRD FR-0, Resolved Decisions (Spatial refactor, Enemy decomposition), and Suggested Milestone 0 (enlarged with the engagement + enchantment lift).
- ✓ **Console topology + in-run editing — applied.** PRD Open Question #1 is resolved to **one `/dungeon/[shortId]` route + an Edit ⇄ Play toggle**, and **in-run geometry editing is moved into v1**, across: Template/instance-isolation ¶, FR §1 (the template-vs-Instance-editing distinction added), Resolved Decision (Map = template), and Suggested Milestone 6. The PRD's *"Instance editing is a later milestone"* framing is retired (geometry → v1; structured content → M6).
- ✓ **M6 narrowed — applied.** PRD Suggested Milestone 6 now reads *Map reuse + structured-content editing*; the geometry-editing slice moved to v1 (M1/M2).
- ✓ **Migration → disposable encounters — applied.** No backfill (**truncate + reseed**), reconciled across PRD FR-0, the single-spatial-truth ¶ (Architecture), Suggested Milestone 0, and the *ADR-details* Open Question; the *"migrate / auto-mint"* phrasing is gone.
- ✓ **Rendering substrate decided — applied.** **React Flow** (`@xyflow/react`) (+ the two spikes, + the SVG escape hatch), reconciled across PRD §Rendering substrate, the *Map canvas* Resolved Decision, and the *ADR-details #3* Open Question.
- ✓ **Atomicity resolved — applied.** The PRD's actual Open Question (*ADR-details #2*) — an **exploration** action that mutates Instance runtime (move/reveal) *and* the Dungeon acted-flag — is resolved as **design-away by default + `guardMany`**. (Separately, moving engagement onto the Instance keeps the **combat** move single-row — a cross-write the ADR itself introduced, not the PRD's question.)
