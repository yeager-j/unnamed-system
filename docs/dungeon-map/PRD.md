# Dungeon Map — PRD

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here.

**Status:** Draft · **Owner:** Jackson · Builds on the **Initiative Tracker** ([../initiative-tracker/PRD.md](../initiative-tracker/PRD.md)). Full technical design (data model, migration, reducer topology) to follow in a **Dungeon Map Architecture ADR**.

> **Prior context.** This builds directly on the Initiative Tracker and assumes its vocabulary. The load-bearing borrowed terms, one line each:
> - **Encounter / `CombatSession`** — the shipped combat tracker and its immutable per-encounter runtime state (turn order, the per-combatant overlay, and — until this feature — the spatial state: the zone graph, engagement, and the Bard's Zone enchantment).
> - **Combatant** — one participant in an encounter (a PC or an enemy), carrying the **overlay** = its per-fight combat state: ailments, battle conditions + durations, reaction. (Its **engagement** and **position** are spatial and live on the Map Instance, not the overlay — see Architecture.)
> - **Engagement** — two combatants locked in melee; **mutual** and **same-Zone** (you can only Engage a co-occupant, and leaving the Zone breaks it). It records *who* you are locked with, not merely *where* you stand — independent data, but with a spatial invariant — so it **lives on the Map Instance** alongside position (this feature relocates it off the combatant).
> - **Enchantment** — a Bard's combat-only buff/debuff anchored to a single Zone (it ends when combat ends). Shipped on the `CombatSession`; this feature relocates it onto the Map Instance with the rest of the spatial state.
> - **Vitals** — persistent HP/SP (and Exhaustion). A PC sources them from its character row; an enemy carries them inline.
> - **Campaign / placed characters** — the DM↔player container. A player *places* a character into a campaign (`characters.campaignId`), the consent that lets the campaign DM write its vitals (`requireOwnerOrCampaignDM`). Delve rosters and encounter casts are drawn from placed characters.
> - **Delve** — a Dungeon being *run*: the exploration-time session. (The **Dungeon** is the entity; the **delve** is the act of running it.)
> - **The encounter watch** — the public, read-only `/c/encounter/[shortId]` player view that polls a redacted server snapshot; the dungeon player view reuses its transport and visibility model.
>
> Game-rule terms (Zones, dungeon turns, ailments, Ranges, …) live in the Obsidian rulebook and are cited by section (e.g. §3.5).

## Overview

The Dungeon Map is the DM's tool for authoring and running a multi-room dungeon — the persistent spatial superstructure that the finished combat tracker's single battlefield was always a slice of. Where an encounter today builds a throwaway Zone graph for one fight and discards it, a dungeon is that same graph made **persistent**: a node-graph of Zones connected by doors, stairs, and passages (some hidden, some locked), explored over dungeon turns, with a fog-of-war player view that reveals as the party goes. Combat does not happen in a separate arena — it happens **on the dungeon itself**.

The feature introduces a clean separation the combat tracker implied but never named. A **Map** is a reusable, **user-owned** authored layout; selecting one for a dungeon mints a **Map Instance** — a snapshot that owns the live space. Three runtime layers then sit over that Instance: the **Map Instance** owns space, a **Dungeon** runs exploration over it, and the existing **Encounter** runs combat over it. The Map Instance is the single spatial truth both exploration and combat render — the same Zone, the same adjacency, the same fog, whether you are searching a crypt or fighting in it. Edits to an Instance never touch its Map, so the same authored dungeon can be run again, or for another party, untouched.

## Goals

- Let a DM author a dungeon as a **node-graph of Zones** — name them, drag them into a layout, wire adjacency, mark connections hidden and/or locked, and write player-facing and private descriptions.
- Give players a synced, **fog-of-war view** that reveals Zones as the party explores, hiding secrets, DM notes, and undiscovered geography.
- Run a **lightweight exploration loop**: track who has acted each dungeon turn and advance the turn counter. (No Exhaustion — the sheet owns it; no per-Zone action taxonomy.)
- Make **combat run on the dungeon**: launch an encounter that uses the whole map, so the party can kite across Zones and the hidden/locked/fog rules hold without a separate arena or a copied graph.
- Factor the **spatial layer out of the combat session** into a reusable **Map** template + a per-run **Map Instance**, so one-off fights and dungeon delves share one spatial engine.

## Non-Goals (v1)

- **Overworld travel.** The §2.4 hex map and node-and-edge world map are a separate, later tool — a different spatial primitive above Zones.
- **Exhaustion tracking.** The character sheet already owns Exhaustion; the dungeon-turn loop does not recompute or write it (it only *reminds* at the onset threshold — see Reminders).
- **A per-Zone dungeon-action taxonomy** (Search / Loot / Keep Watch / Help / Interact / Move Quietly / Take Your Time). The loop tracks only *that* a character has acted this turn, not *what* the action was.
- **Players moving their own tokens.** The DM drives all movement and reveal; the player view is read-only (consistent with the combat watch).
- **Image / tile / VTT maps.** The map is an abstract node-graph, faithful to the gridless "theater of the mind" Zone philosophy.
- **Random-encounter automation.** The tool *reminds* the DM to roll at a configured cadence (see Reminders) but does not roll the dice, ship a random-encounter table, or auto-spawn the encounter — the DM rolls and adjudicates.
- **A dice roller.** Consistent with the rest of the app.
- **Structured Zone contents** (loot / monster / trap markers). Authored content is free-text for v1; structured, individually-revealable features are a later milestone.
- **Multi-floor dungeons.** One Map (one Instance) per Dungeon for v1; multiple Maps/floors per Dungeon is a later extension.

## Users & Context

The primary user is the **DM**, authoring a dungeon ahead of a session and running it live at the table on a laptop or tablet. The secondary audience is **players**, watching a real-time fog-of-war view on their own devices or a shared screen — they see the map unfold but do not drive it. A dungeon runs within a **Campaign**, the same DM↔player boundary the combat tracker established (`campaign_users` membership + placed `characters.campaignId`; the campaign DM gates dungeon/Map-Instance writes via `requireCampaignDM`, while a character's vitals stay owner-or-DM via `requireOwnerOrCampaignDM`, and a user-owned **Map** gates on its owner — see the ADR's _Authorization_ section). The tool spans **prep** (authoring the map) and **run** (driving the delve and launching combat); the shared view stays in sync with the DM's actions without manual refresh, via polling like the encounter watch.

## Architecture & Integration

The Dungeon Map is built as **new routes inside the existing app** — a DM console (`/dungeon/[shortId]`), a fog-of-war player view (`/c/dungeon/[shortId]`), and a dungeons list on the campaign page — reusing the app's auth, campaigns, and game engine. The full technical design (data model, migration, reducer topology) is deferred to a forthcoming **Dungeon Map Architecture ADR**; this section states the load-bearing decisions.

**A reusable Map, instantiated per run, under three runtime layers.** A **Map** is standalone, **user-owned** authored geography — a reusable template that belongs to no campaign or dungeon. Selecting a Map when building a dungeon (or setting up a one-off encounter) mints a **Map Instance**: a snapshot copy of the Map's geography that owns all runtime. Three layers run a session over that Instance:

- **Map Instance — space.** Holds the snapshot of the Map's `ZoneGraph` (Zones; connections with `hidden` / `locked` flags; node `(x, y)` layout) and per-Zone authored content (player-facing description + private DM notes; later, structured features), plus the **runtime spatial state**: token occupancy (where every combatant stands), reveal-state (which Zones and hidden connections players can currently see), and — while a fight is live — the combat-scoped spatial state (engagement + the Bard's Zone enchantment, pruned at combat-end). The snapshot isolates it both ways — editing an Instance never touches its Map, and editing a Map never reaches Instances already minted.
- **Dungeon — exploration-time.** A temporal layer over a Map Instance: the dungeon-turn loop (a turn counter + per-character "acted this turn" flags), the delve roster, lifecycle/status, and the DM-only reminder settings (random-encounter cadence). Owns **no** geography.
- **Encounter — combat-time.** The existing combat layer, re-pointed. It keeps turn order, the **non-spatial** combat overlay (ailments / battle conditions + durations / reaction), the end-of-turn prompts, and enemy identity + vitals — but **references a Map Instance** for all spatial state (position, engagement, enchantment) instead of owning `zones` / `adjacency` / `combatant.zoneId`.

`Dungeon : exploration-time :: Encounter : combat-time` — both are purely temporal layers sitting over one Map Instance. **Movement and reveal are *spatial* transitions the Map Instance owns** (the "move into a Zone → reveal it and its non-hidden neighbors" rule lives in one place); the two temporal layers invoke them rather than reimplementing them. Engine purity holds throughout: pure reducers over immutable state, statefulness in the DB and React, never in the engine.

**The Map Instance is the single spatial truth.** Today the `CombatSession` owns `zones`, `adjacency`, every `combatant.zoneId`, each combatant's **engagement**, and the Bard **enchantment**. All of it moves to the Map Instance. One place renders every token, one adjacency/movement model, one fog filter — whether exploring or fighting. The combatant keeps only its **non-spatial** overlay (ailments, conditions, reaction); engagement and enchantment are spatially-determined (engagement carries a same-Zone invariant and breaks on leaving the Zone; enchantment is anchored to a Zone and ends with combat), so they ride the Instance, not the combatant. This is a **real refactor of the shipped tracker**, not an add-on; existing encounters are **disposable** — the spatial-refactor cutover truncates and reseeds them under the new model rather than backfilling (see the ADR).

**Combat runs on the dungeon, not in a copied arena.** Starting combat during a delve does not carve a sub-graph or copy anything — it **places enemy combatants onto the live Map Instance** and layers a turn loop over it. The whole dungeon is always in play, so the party can kite across Zones, and the hidden/locked/fog rules hold automatically because there is exactly one spatial source. Copying the Instance into the encounter would re-introduce the very dual-home the combat PRD eliminated ("all combat state moves to the combatant"); running on the dungeon avoids it. When combat ends, enemy tokens are pruned, PC tokens remain where they ended, and the DM marks off the dungeon turn the fight consumed (§2.2: "a fight consumes the dungeon turn in which it happens"). Which layer may write occupancy depends on the mode: in exploration the DM moves tokens freely (Dungeon); once combat is live, occupancy is written **only through the Encounter's movement model**, so engagement, opportunity attacks, and interception are still enforced (guided-but-overridable, as today) rather than bypassed by a free drag.

**Enemy decomposition mirrors PCs.** A PC is already split across layers — **vitals** on the character row, **position + engagement** on the Map Instance (the token), the **non-spatial combat overlay** on the Encounter. An enemy splits identically: **position + engagement → a token on the Map Instance**, **identity + vitals + non-spatial overlay → Encounter** (ephemeral, dies with the session, as it does today). The only axis that differs is the vitals source (PC → character row; enemy → inline / catalog on the combatant) — which is the one axis that already differs today. No new dual-home; the Map Instance stays the single spatial truth that exploration and combat both render.

**Tokens, position identity, and the no-dungeon case.** Position is never a property of a character or a combatant — it is always a **token** in a Map Instance's occupancy: `{ zoneId, occupant }`, where `occupant` keys to either a **placed character** (`characterId`) or an **enemy** (its encounter `combatant.id`). That occupant key *is* the join to the combat state held elsewhere, and it is what lets PC tokens persist while enemy combatants stay ephemeral:

- **PC token** — keyed by `characterId`, so it outlives any one encounter; a PC combatant reuses the character's existing token in place. Created on placement (delve start, or standalone encounter setup); persists across the delve, including through combats on it; pruned when the character leaves the delve or the standalone encounter ends.
- **Enemy token** — keyed by `combatant.id`; the enemy combatant *is* the thing its token points at. Minted when the enemy is added at combat start; pruned when the encounter ends.
- **No position until placed** — a character has no position at all until it is placed as a token on some Map Instance.

Consequently **every Encounter references a Map Instance** — there is no position without one. A one-off skirmish with no dungeon gets its own Instance (minted from a Map template, or authored ad hoc) in encounter setup — this *replaces* today's inline zone authoring on the `CombatSession`; a dungeon encounter reuses the dungeon's Instance.

**Fog-of-war lives on the Map Instance.** "Fog" is two things: the **authored** visibility flags (`hidden` / `locked` on a connection, snapshotted from the Map) and the **runtime** reveal-state (which Zones and hidden connections are revealed *right now*). The reveal-state co-locates with the flags and with occupancy on the Instance, because: (1) the one question that matters — "can the player see this edge right now?" — needs both halves, so co-locating keeps it answerable in one place; (2) the move→reveal rule is an Instance event mutating Instance state, self-contained in one reducer; and (3) a one-off battle map can then have a hidden area with no Dungeon involved. Reveal auto-fires on entry (entering a Zone reveals it and surfaces its non-hidden neighbors as **known exits**); the DM can also reveal or hide any Zone or connection manually — e.g. after a successful Search uncovers a secret passage, or to unlock a barred door.

**Template/instance isolation, and replay.** The `hidden` / `locked` flags are **authored** geography on the Map; selecting a Map snapshots them into the Instance, where they stay immutable during play. **Reveal** and **unlock** are *runtime overlays* on the Instance — the sets of currently-revealed and currently-unlocked connections — not edits to the flags. So a DM revealing a secret door or unlocking a gate mutates only the Instance's runtime; the Map template is untouched. The snapshot isolates both directions: editing an Instance (its **geometry** in v1 via the console's Edit mode; **structured content** — e.g. dropping a monster marker — later) never reaches its Map, and editing a Map never reaches Instances already minted (only *future* instantiations see it). **Replaying** a dungeon, or running it for another party, simply mints a fresh Instance from the Map with empty runtime. Fog is a **single shared view** of what the party has collectively discovered — not per-character line of sight — so a Zone any one character enters is revealed for every viewer, which is also how a split party stays legible.

**Player view: redacted snapshot, polled.** The fog-of-war view consumes a **redacted projection of the Map Instance** — undiscovered Zones hidden, hidden-and-unrevealed connections invisible, DM notes stripped, and (when combat is live) enemy affinities hidden per the combat-watch visibility model — polled (~1.5s) behind the same swappable transport seam the encounter watch uses (zero new infra; SSE / push remain drop-in later). The DM drives all movement and reveal; the view is strictly read-only.

## Rules Recap

For reference, the mechanics the tool must respect (full text in the Obsidian vault):

**Zones (§3.5).** A Zone is a ~30 ft "theater of the mind" region; characters in a Zone are not pinned to a spot. Two Zones are **adjacent** if a character can travel between them without crossing a third. Adjacency is set by the fiction — a staircase, bridge, or open archway connects; a locked door, chasm, or sheer wall separates. The DM describes the Zones in play before combat. **Engagement** is mutual and **same-Zone**: you can only Engage a co-occupant, and a character becomes Free on leaving the Zone (§3.5) — so it is spatially coupled, not independent of position.

**Dungeon turns (§2.2).** Inside a dungeon, time is measured in **dungeon turns** of ~10 minutes. Each turn, every character chooses one action; there is **no fixed order**, and the party may split up (one searches the library while another picks a lock). Moving between adjacent Zones at a normal pace costs no turn; searching or moving stealthily does. **A fight consumes the dungeon turn in which it happens.** A normal day is ~48 turns (8 hours); past that, Exhaustion accrues every 3 turns — **tracked on the character sheet, not here**.

**Exploration scales (§2.4).** Above the dungeon sit the hex map (unmapped wilderness) and the node-and-edge world map (known world) — both **out of scope** for this tool.

**Combat geometry.** Engagement, movement (Travel / Engage / Approach / Disengage), Ranges, opportunity attacks, and interception are **behaviorally unchanged**. The Encounter's movement model still computes them, but it now reads — and writes — combatant **position and engagement on the Map Instance** rather than on the combat session.

## Map Canvas & UX

The Map renders as a node-graph on a navigable canvas, shared by all three surfaces — the DM builder, the DM run console, and the player view. The functional interactions live in the requirements below; this section fixes the canvas behavior they share.

**Navigation (all surfaces).**

- **Pan & zoom** — drag the background to pan, scroll/pinch to zoom. A multi-Zone dungeon won't fit one screen, and the player view grows as Zones reveal, so this is table stakes. Dragging a *node* moves the node; dragging the *background* pans.
- **Zoom-to-fit / recenter** — fit the visible graph to the viewport, and recenter on the party (or the current actor in combat).
- **Touch + responsive** — usable at tablet and phone widths: the DM is on a laptop or tablet (pinch-zoom, touch-drag), players on phones or a shared screen.
- **Performance** — stays smooth at dozens of Zones.
- **Minimap** — an overview inset for large maps; deferred to a later milestone.

**Interactions by surface.**

- **DM builder** — add a Zone (button / double-click canvas) and drag to position (persists as the node `(x, y)` layout); draw a connection by dragging between Zones; click a connection to toggle `hidden` / `locked` or delete; click a Zone for a side panel (name, descriptions, DM notes).
- **DM run console** — drag a token between Zones (snaps along adjacency; `locked` blocks it, with the guided-but-overridable override); click a Zone/connection to reveal / hide / unlock; a side rail holds the turn counter, acted-flags, and reminders.
- **Player view** — read-only pan/zoom over the revealed portion only. When polling reveals a new Zone the viewport **stays put** (never auto-jumps and yanks the view); newly-revealed Zones are briefly **highlighted**, and a **"recenter / fit revealed"** control jumps to the action on demand.

**Rendering substrate.** The Architecture ADR decides this: **React Flow** (`@xyflow/react`), with a hand-rolled-SVG + `d3-zoom` escape hatch — the PRD fixes only the UX above. A library buys pan/zoom/drag/connect/minimap and custom node rendering for the cost of a dependency.

**States.** The canvas defines a **loading** skeleton, a **hard-error** state (Map Instance deleted / 404, fetch failed) distinct from the fog/empty states, and — for the polled player view — a **stale / offline indicator** ("last synced Ns ago · reconnecting"): on poll failure the map stays frozen-but-readable, never blank, so a stale fog is never mistaken for a quiet live one.

**Accessibility (v1, not an afterthought).** A node-graph is hard for assistive tech and costly to retrofit, so v1 commits to: **keyboard navigation** (roving-tabindex Zone list + arrow-key traversal along adjacency; Enter opens the side panel / triggers actions); **non-color encoding** of every state (hidden / locked / revealed connections and token side conveyed by icon, line style, and label — never color alone); **reduced-motion** (instant recenter and static reveal markers instead of animation); and an **aria-live** region announcing reveals and moves, with a per-Zone accessible description ("Crypt — revealed; exits: locked door to Vault, open passage to Hall; 2 party tokens"). A fuller screen-reader narrative is a fast-follow.

**Responsive & wayfinding.** At tablet width the **Zone side-panel is an overlay/drawer** over the canvas and the rail is collapsible (rail + panel + canvas can't share ~1024px). A **roster rail** lists each PC → current Zone + acted state with **tap-to-recenter**, so a split party is legible without hunting the canvas (DM and player). When a reveal lands **off-viewport**, a persistent **"N new areas revealed → recenter"** cue appears, since the stay-put highlight is invisible off-screen.

## User Journeys & States

The sections above fix the model; this one fixes the *choreography* — the flows and the not-live states each surface must cover. (From the UX audit, whose meta-finding was that the spec was strong on state and thin on journeys.)

### DM journeys

- **First run (zero → running delve).** From the campaign page, **New dungeon** opens a create dialog whose Map picker lists the DM's **own Maps**; when it is empty (or any time), **New Map** authors one inline. Maps also live on a user-owned **"My Maps"** surface reachable on its own. Authoring **autosaves** — a Map persists as a draft on first edit (node drags persist the `(x, y)` layout); no explicit Save. The DM then builds the delve: pick the roster from the campaign's placed characters (a member with no placed character is shown but skippable; a partial roster is fine), place tokens, and run.
- **Resume.** Reopening `/dungeon/[shortId]` restores the console in its **exact prior state** — exploration, or the live-combat branch if a fight was underway — mirroring how `/combat` resumes a live encounter. "I closed the laptop" must not lose the delve.
- **Combat round-trip.** On combat **end**, the console returns to exploration with a one-tap **"this fight consumed dungeon turn N → advance"** confirmation, so marking off the turn is a button, not a memory test.

### Player journeys & states

- **Discovery.** A member finds the delve from their **campaign overview** — a live-delve banner + a link to `/c/dungeon/[shortId]`, the way the campaign page already surfaces a live encounter.
- **Status-branched view.** The player view branches like the encounter watch: **draft / not-started** ("the delve hasn't begun"), **live** (the fog map), **ended** (a frozen final reveal) — never a bare canvas.
- **Self-identification.** Tokens are **labeled** with character names, and the viewer's **own** token(s) are visually distinguished (the watch's "owns this here" signal). A signed-out **spectator** sees the map only; a signed-in **member** also gets self-highlight (and, in combat, their own sheet).
- **During combat.** When an encounter goes live on the dungeon, the player view **composes the same own-character sheet column + combat controls as the encounter watch**, with the dungeon map as the battlefield panel — no redirect — and shows a **"Combat — Round N · current actor"** signal so the mode flip is legible. During *exploration* there is no turn order: the player sees only the day's **turn counter**, never a turn queue (acted-flags stay DM-only).

### Lifecycle & empty states

- **Mid-delve join.** A placed character can be added to a live delve; the DM places its token in any revealed Zone (like the tracker's "joins mid-round").
- **Fallen / Dead.** A PC at 0 HP keeps its token but is flagged; a full-party wipe surfaces a prompt. Display only — no special exploration mechanics (vitals live on the character row).
- **Editing a Map with live Instances** shows a **non-blocking notice** that edits apply to *future* delves only (snapshot isolation), so the running delve's unchanged state isn't a surprise.
- **Empty states** are defined for every new surface: **My Maps** (none → "Create your first map"), the **dungeons list** (none → create CTA), a **blank canvas** ("Add a Zone"), the **pre-placement console**, and the **player view before reveal** ("the party hasn't entered yet" — distinct from a load error).

## Functional Requirements

### 0. Spatial refactor (prerequisite)

Factor the spatial layer out of the `CombatSession` into a **Map** (reusable, user-owned authored template) and a **Map Instance** (per-run runtime snapshot). Lift `Zone` and the zone graph to a shared primitive; the Instance owns occupancy (`zones`, `adjacency`, and `combatant.zoneId` move there) **plus engagement and the Bard enchantment** (also spatial); the combatant retains only its **non-spatial** overlay; the Encounter gains a Map Instance reference. Existing encounters are **disposable** — the cutover **truncates and reseeds** them under the new model (each reseeded encounter mints its Map Instance), **not** backfilling old rows. **Combat behavior is unchanged** — this is a refactor, and the gate for everything else.

### 1. Map authoring (DM)

A **node-graph editor**: add and name Zones (draggable nodes), wire adjacency (connections between nodes), and mark each connection **`hidden` and/or `locked`** (independent flags). Per Zone, author a **player-facing description** (shown on reveal) and **private DM notes**. A **Map** is **standalone and user-owned** — it belongs to no campaign or dungeon, so the DM can reuse it across dungeons and campaigns. Authoring produces a template; selecting it when building a dungeon (§2) mints a Map Instance. (Authoring a **Map template** here is distinct from editing a delve's **Map Instance**: in-run **geometry** editing of an Instance ships in v1 via the console's Edit mode — see the ADR's _Console topology_ — while a **library browser** for saved Maps and **structured-content** editing of an Instance are later milestones.) Authoring **autosaves** (the Map persists as a draft on edit). Destructive edits **confirm**: deleting a Zone cascades its connections (blocked, or relocates tokens, if a live Instance occupies it); a **disconnected graph or duplicate Zone names are warnings, not blocks** — gridless Zones tolerate both.

### 2. Dungeon model + lifecycle

A **Dungeon** belongs to a campaign and is built by **selecting a Map**, which mints the Dungeon's **Map Instance** (its spatial truth). The DM creates, saves, and resumes a dungeon; a **dungeons list + create dialog** live on the campaign page. The **delve roster** is a subset of the campaign's placed characters. Status/lifecycle mirrors encounters (draft → active → done); **one active delve per campaign** at a time (mirroring the one-live-encounter-per-campaign rule), which may contain the one live encounter. A dungeon **cannot be ended while its encounter is live** — the same live-encounter lifecycle lock the tracker already enforces — so the Encounter never dangles a reference to a Map Instance whose Dungeon is gone.

### 3. Exploration run (DM)

The DM drives the delve from the console: place the party's character **tokens** on the Map Instance, **move** each token between Zones (per-character — the party can split up), **reveal/hide** Zones and hidden connections, and run the **dungeon-turn loop** — mark which characters have acted this turn and advance the turn counter (the tool can nudge when all have acted). The loop does **no Exhaustion tracking and no per-Zone action taxonomy** — it counts turns and who has acted, nothing more.

### 4. Reminders (DM-only)

A small **DM-only** reminder surface on the console, seeded with two reminders the dungeon-turn counter drives and structured so more can be added later. Reminders **nudge** — they never roll, resolve, or auto-act, and they never appear in the player view.

- **Random encounters.** A per-dungeon setting authored in the builder: `Random Encounters? [Y/N]` and `Interval [10m / 20m / 30m / 1h]` (stored as 1 / 2 / 3 / 6 dungeon turns, the loop's native unit). When enabled, the console nudges *"Roll for a random encounter"* each time the turn counter reaches a multiple of the interval. The DM rolls with their own dice/table and, if it triggers, starts an encounter via §7. The tool ships no random-encounter table and spawns nothing.
- **Exhaustion onset.** Beginning the **turn past the 48-turn day** and on each **+3-turn cadence** thereafter (turn 49, 52, 55, …) the console nudges that a level of Exhaustion would accrue (§2.2) — once per threshold, **not** every turn. Reminder only — the character sheet still owns the Exhaustion value; the loop neither computes nor writes it. Always on; no setting.

Both are **pure selectors over the Dungeon's turn counter** — the reducer holds no reminder state. A fired reminder is **dismissible**, but dismissal is **component-local UI state** (exactly as the tracker's end-of-turn modal keeps its `dismissed` set in `useState`, reset per open — never persisted), so a later trigger surfaces fresh.

### 5. Fog-of-war + reveal

Moving a token into a Zone **reveals** that Zone to players and surfaces its **non-hidden neighbors as known exits** — a silhouette shows only *that* an exit exists **and whether it's locked**, not the neighbor Zone's name, description, or contents, which appear only once that Zone is itself revealed (no door/stairs/passage taxonomy in v1). **Hidden** connections stay invisible (and unsurfaced) until the DM reveals them; **locked** connections show but block movement until the DM unlocks them. Because revealing or unlocking is **player-visible and socially irreversible**, both go through a **confirm** before they fire. The DM can also **manually reveal or hide** any Zone or connection. Reveal is a single shared party-wide view, not per-character line of sight; an off-viewport reveal raises the "new areas revealed" cue (see Map Canvas & UX).

### 6. Player view (fog-of-war)

A real-time, **read-only** `/c/dungeon/[shortId]` view: the revealed portion of the Map Instance (node-graph), party tokens, and the current dungeon turn. The redacted snapshot distinguishes **three** states per element — fully revealed, known-exit silhouette, and stripped — with undiscovered Zones, unrevealed hidden connections, and DM notes **stripped server-side**. Fog is at Zone/connection granularity: any token in a revealed Zone is visible (enemy tokens carry the combat-watch redaction — HP/SP shown, affinities hidden); there is no per-token stealth in v1 (a concealed monster is a later structured feature). Tokens are **labeled** and the viewer's **own** token(s) highlighted (spectator = map only; member = self-highlight). The view is **status-branched** (draft / live / ended) and **stale-aware**; when an encounter is live it composes the watch's own-sheet column + a "Combat — Round N" signal, and in exploration it shows only the day's turn counter (no turn queue) — see **User Journeys & States**. Polled for live updates; signed-out-visible, like the encounter watch.

### 7. Combat integration

From the console, the DM **starts an encounter on the current dungeon**: add enemy combatants (catalog or free-entry), place them onto Zones, and hand off to the existing tracker's start-combat flow (the DM declares Player / Enemy / Neutral advantage; turn order proceeds as today). Combat then runs over the **same Map Instance**. The **whole map is in play** (kiting allowed; locked / hidden / fog respected). On end, enemy tokens are pruned, PC positions persist, and the DM marks off the consumed dungeon turn. HP/SP already persist on the character row, so post-combat state carries over for free.

### 8. Structured Zone features (later)

Per-Zone **structured content** — loot, monster, trap, and hidden-feature entries the DM places and reveals individually. A "monster" feature **spawns** into an Encounter combatant + token at combat start; the authored marker and the live creature stay distinct.

## Open Questions

- **DM console topology** *(resolved in the ADR):* **one `/dungeon/[shortId]` route** with an **Edit ⇄ Play** mode toggle (orthogonal to lifecycle status), not a separate builder + live console — see the ADR's _Console topology & surfaces_.
- **Shared map catalog:** v1 Maps are **user-owned** templates the author reuses; whether they later become shareable/published (a global catalog, like the enemy catalog) is open.
- **Canvas undo/history:** authoring autosaves with no explicit Save, so an accidental delete-Zone or mis-drawn adjacency needs a recovery story — the destructive-edit confirm is not undo. Open.
- **DM-console concurrent-write UX:** how the console surfaces an optimistic version conflict (the shipped combat console can silently drop a concurrent DM write — frontend audit); ideally a shared queued-write primitive rather than re-hand-rolling. Open.
- **Multi-DM:** whether a second concurrent DM session/tab is supported, or single-writer-by-convention (the single-row-write model assumes one writer). Open.
- **Player view during DM Edit-mode:** what a watcher sees while the DM edits geometry mid-delve — a frozen snapshot, vs. half-wired geometry or a just-deleted occupied Zone. Open.
- **ADR details** *(resolved in the ADR):* (1) **migration** — existing encounters are disposable; the spatial-refactor cutover **truncates + reseeds** under the new model (no backfill); (2) **cross-container atomicity** (an exploration action that mutates Instance runtime via move/reveal *and* the Dungeon's acted-flag) — **designed away** for normal moves (Instance-only) + a small **`guardMany`** transaction for the few genuinely-atomic gestures; (3) **map canvas rendering substrate** — **React Flow** (`@xyflow/react`), with a hand-rolled-SVG escape hatch. See the ADR.

## Resolved Decisions

The decisions this PRD commits to, one line each. The **body sections above are authoritative** — this is a navigable index, not a second copy (full technical rationale lives in the ADR).

| Decision | In short | Detail in |
| -- | -- | -- |
| Scope | Dungeon Zone-graph only; the overworld (hex / node-and-edge) is a separate, later tool | _Overview_, _Non-Goals_ |
| Three layers over a reusable Map | **Map Instance** (space) / **Dungeon** (exploration) / **Encounter** (combat) over a per-run Instance minted from a user-owned **Map**; the Instance is the single spatial truth | _Architecture & Integration_ |
| Map UX | Abstract **node-graph** (draggable Zones + adjacency edges), not a tile/image/VTT map | _Architecture & Integration_ |
| Connections carry state | Each connection **`hidden` and/or `locked`** (independent flags) | _Functional Requirements_ (FR-1) |
| Spatial refactor | `zones` / `adjacency` / `zoneId` **+ engagement + the Bard enchantment** leave the `CombatSession` for the Instance; the combatant keeps only its non-spatial overlay | _Architecture & Integration_ |
| Combat on the dungeon | No copy / sub-graph — enemies placed on the **live Instance**; whole map in play (kiting); hidden/locked/fog hold via the single source | _Architecture & Integration_ |
| Enemy decomposition | **position + engagement → Instance token**; **identity + vitals + non-spatial overlay → Encounter** (ephemeral) | _Architecture & Integration_ |
| Position identity | token `occupant` = `characterId` (persistent) or `combatant.id` (ephemeral); **every Encounter references an Instance** | _Architecture & Integration_ |
| Map = template, Instance = runtime | Snapshot mint; **bidirectional isolation**; **in-run geometry editing in v1**, library browser + structured-content editing later | _Architecture & Integration_, FR-1 |
| Fog-of-war home | reveal-state on the **Instance**; auto-reveal on entry + DM manual; standalone maps can have secrets | _Architecture & Integration_, FR-5 |
| Authored vs. runtime visibility | `hidden`/`locked` immutable flags; reveal/unlock runtime overlays; fog is one **shared** view, not per-character | _Architecture & Integration_ |
| Delve concurrency | One active delve per campaign; a dungeon can't end while its encounter is live | FR-2 |
| Reminders | DM-only nudges (random-encounter cadence; Exhaustion onset) — never roll/resolve/spawn; pure turn-counter selectors | FR-4 |
| Exploration loop | "acted this turn" + a turn counter only — no Exhaustion tracking, no per-Zone action taxonomy | FR-3 |
| Movement authority | Per-character tokens, **DM-driven**; players watch | _Architecture & Integration_ |
| Zone contents | Free-text description + DM notes in v1; structured features later | FR-1, FR-8 |
| Player transport | Redacted snapshot, polled (~1.5s) behind the watch's swappable seam; enemy affinities hidden in combat | _Architecture & Integration_, FR-6 |
| Map canvas | Shared **pan/zoom canvas** (fit / recenter / touch); **stays put on reveal**; rendering library is **React Flow** (ADR) | _Map Canvas & UX_ |
| Accessibility | v1 requirement — keyboard graph nav, non-color encoding, reduced-motion, aria-live announcer | _Map Canvas & UX_ |
| Player view | Status-branched (draft/live/ended) + self-identifying; combat composes own-sheet + "Round N"; exploration = turn counter only | _Map Canvas & UX_, FR-6 |
| Reminders dismissal | Component-local ephemeral state; Exhaustion-onset fires once per +3 threshold from turn 49 (the turn past the day) | FR-4 |
| Reveal/unlock confirm | Player-visible, socially-irreversible reveals (and destructive map edits) confirm before firing | FR-5 |
| Silhouette | Known-exit silhouette = exit + locked only; no connection-type field in v1 | FR-5 |
| Authorization | Map writes gate on the **owner**; Map-Instance + Dungeon writes on the **campaign DM** | ADR _Authorization_ |

## Suggested Milestones

0. **Spatial refactor (prereq):** lift `Zone` / the zone graph to a shared primitive; introduce the **Map** (template) + **Map Instance** (runtime) entities; occupancy (zones / adjacency / `zoneId`) **plus engagement + the Bard enchantment** moves onto the Instance; existing encounters are **truncated and reseeded** under the new model (no backfill — encounters are disposable). No behavior change to combat.
1. **Map authoring:** author a **standalone, user-owned Map** — the node-graph editor on a **pan/zoom canvas** (Zones, adjacency, hidden/locked connections, descriptions + DM notes) + the author's Map list/CRUD.
2. **Exploration run:** the Dungeon model (select a Map → mint its Instance; dungeons list + create dialog on the campaign page) + delve roster + token placement + per-character DM-driven movement + the dungeon-turn loop (acted-flags + counter) + the DM-only reminders (random-encounter cadence + Exhaustion onset, pure selectors over the counter). Map Instance runtime: occupancy + reveal-state + the move→reveal rule.
3. **Player fog-of-war view:** `/c/dungeon/[shortId]`, redacted snapshot, polled, auto-reveal-on-entry + known exits; stay-put viewport (highlight new Zones + recenter control).
4. **Combat integration:** launch an encounter on the dungeon (enemies onto the live Instance); whole-map play; return-to-map and mark off the consumed turn on end.
5. **Structured Zone features (later):** loot / monster / trap / hidden-feature, individually revealable; monster→combatant spawn.
6. **Map reuse + structured-content editing (later):** a library browser to pick from saved Maps when building a dungeon; editing **structured content** on a live Map Instance (drop/move markers, monster spawns) with snapshot isolation from the template. (In-run **geometry** editing — add Zones / move connections — ships earlier, in v1's Edit mode.)
