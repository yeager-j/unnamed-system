# Procedural Dungeons (Drakkenheim) — PRD

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here. Last ported from Linear: 2026-06-29; finalized in a design session 2026-07-07 (including a critique pass — see *Resolved Questions*).

**Status:** Final · **Owner:** Jackson · Full technical design (schemas, the generation algorithm's realization, the pages substrate, the cross-expedition memory model) lives in **[technical-design.md](./technical-design.md)** (2026-07-08 design session; revised 2026-07-16 after an implementation-readiness review — its D5 decision now carries cross-expedition memory as Region **knowledge folds** over ordinary per-expedition instances, restoring this PRD's original reveal-copy model with a proper home, as noted inline below). · **Scope boundary:** all cross-expedition *campaign* state — faction clocks, NPC agendas, downtime, the passage of days — belongs to the **Campaign Planner** ([../campaign-planner/PRD.md](../campaign-planner/PRD.md)). This feature owns what happens *inside* one expedition plus one narrow cross-expedition object (the **Region**, below); the Planner owns what happens between expeditions. The two must never grow overlapping clocks.

> **Prior context.** This builds on the shipped spatial substrate. The load-bearing borrowed terms, one line each:
>
> - **Map** — a user-owned, campaign-agnostic authored template (`map.geometry` jsonb): Zones (`id`, `name`, `description`, `dmNotes`, `position`) + undirected connections (`hidden`/`locked` flags), edited on the React Flow canvas.
> - **MapInstance** — the per-run spatial truth: a **snapshot** of a Map's geometry taken at delve start, plus runtime overlays (occupancy tokens, reveal fog, enchantment). Instances already accept live geometry edits (`editGeometry` wraps the full template edit vocabulary) — this is the seam generation rides.
> - **Dungeon row** — the exploration run object: campaign-scoped, `draft → active → done`, owns the turn counter (`DungeonState.turnCounter`) and references exactly one MapInstance. DM console at `/dungeon/{shortId}`, player watch at `/c/dungeon/{shortId}`.
> - **Reveal / fog** — zones are unrevealed until the party moves in (`move → reveal`) or the DM toggles them; the player snapshot (`projectDungeonSnapshot`) redacts **structurally** — unrevealed zones, hidden connections, and DM notes are never written to the payload, a property enforced by a release-gate integration test.
> - **Dungeon Turns** (rulebook §2.2) — ~10 min of careful exploration per turn; an expedition is ~8 hours = **48 turns**; from turn 49, +1 Exhaustion per 3 turns. Zone-to-zone movement at normal pace costs **no** turn — turns are consumed by actions. The console already surfaces the turn budget, fires persistent overtime Exhaustion reminders, **and ships a `random-encounter` reminder on a configurable turn interval** (`reminderSettings`); players apply Exhaustion themselves. What the rulebook lacks: any procedure for *what* a random encounter is (no die, no table), and any turn cost for exploration itself. This feature supplies both (see *Generation at the table* and *Contents & wandering encounters*); canonizing them in the rules vault is follow-up work.
> - **Enemy catalog** — the reusable enemy library backing combat staging (`apps/web/components/combat/enemies/enemy-catalog-panel.tsx`); encounter tables reference it. The item catalog similarly backs loot rows.

## Overview

This feature turns dungeon exploration into a **procedurally generated, roguelike-feeling experience** built on the system's existing **Zone graph** — the abstract, grid-free unit of space the Map editor and dungeon run console already use. The motivating campaign is *Dungeons of Drakkenheim*: a post-apocalyptic city warped by a magically radioactive meteor, where factions race the party toward the crown in the castle throne room. The official module's weakness is that **exploring the city is thinly detailed**; this feature replaces flat "you wander the ruins" narration with a city that is **generated as you explore and different every expedition** — the Tartarus (Persona 3) / Mementos (Persona 5) feel.

The pitch in one line: **make Dungeon Turns bite.** Pushing into unexplored space costs a Dungeon Turn (a new rule this feature ships — see *Generation at the table*), so the clock — the 48-turn Exhaustion budget, wandering-encounter checks, attrition — bites in exact proportion to how deep the party dares to push. Novel, dangerous routes every expedition make that spend real, not bookkeeping.

**The city does not remember.** An earlier draft persisted discovered "landmarks" across expeditions. That's gone, deliberately: the Haze reshapes the city daily, so *nothing spatial survives* between expeditions — each one regenerates from the seed Map. What survives is **knowledge**, carried by one cheap mechanism: the delve-setup **site checklist** — tick a site and it is guaranteed to appear this expedition (findable again, never in the same place), with known landmarks pre-ticked by default and the Region annotating which sites the party has actually found; mid-run, a known site can be **force-placed** ("you navigate by rumor to the castle") instead of re-rolled for. Static interiors are stable *buildings* — their layout never reshuffles, and their explored state carries forward (see *Pages & portals*) — only their street address moves.

This is feasible here precisely because the system has **no grid**. Procedural *grid* dungeons must solve a 2D packing/pathfinding problem. A Zone graph has none of that: generation is *adding nodes and edges to a graph* — and the live MapInstance already accepts exactly those edits. The system's spatial substrate is, by happy accident, the ideal substrate for this.

## Goals

- Let a DM author **Template Sets** — named, user-owned, reusable collections of Zone templates (room archetypes: Hallway, Plaza, Armory) with adjacency tags, exits, spawn weights, and content tables — and have the engine **stitch them into a fresh, legal Zone graph** each expedition.
- Give each campaign's procedural terrain a home: the **Region** — the campaign-scoped object binding a seed Map to a Template Set and owning the narrow cross-expedition memory (discovered sites, wandering designation). Expeditions are minted from a Region.
- Generate **just-in-time, one gesture per zone**: the DM expands silhouette stubs as the party explores; each expansion costs the party a Dungeon Turn; generation mints DM-side and reveal stays the existing move-in mechanic. The DM doesn't know what's coming either — that's part of the fun — with **force-pick** as the escape hatch when they want foreknowledge.
- Support **declared expedition objectives** — a **site checklist at delve setup** (some sites appear by default; "we're finding the Reliquary today" is a tick, or a mid-run addition) with a **provable guarantee**: a declared site *will* appear within a bounded number of qualifying expansions past its minimum depth — no probability asymptotics, no global solver.
- Support **content tables** on templates ("20% of Hallways roll the City Scavengers table") producing a structured DM-only **contents manifest** per zone with **one-click combat staging**, plus a per-Region **wandering table** wired into the shipped random-encounter reminder — so generated space carries generated content and *time* carries danger, not just space.
- Reach the module's **static, handcrafted dungeons** (the castle, etc.) *through* the procedural terrain via **portals**, without losing Dungeon Turn progress at the boundary — one expedition, one clock, one console, one watch URL (see *Pages & portals*).
- Keep hand-authoring **first-class at every step**: the seed Map is an ordinary Map, any authored zone can join the grammar, and the DM can force a template, hand-place a zone, retract a roll, or edit anything mid-run. Manual override is an escape hatch at every step, never the primary path.

## Non-Goals (v1)

- **Spatial persistence between expeditions.** No landmarks, no saved layout. The reshuffle is the fiction. (Knowledge persists via the Region's discovered-sites list, re-declarable objectives, and the per-static-Map explored-state fold that re-applies when a stable building is re-entered — tech design D5.)
- **Grid / tactical positioning.** This rides the abstract Zone model; no tiles, no movement ranges.
- **Quest modeling of any kind.** An objective is a *guaranteed appearance* ("I want this node to appear this expedition") — nothing more. No quest entities, no prerequisite chains (linear or branching), no lock-and-key ordering, no dependency graph. The campaign's actual play pattern (go to a landmark, tasked or by rumor; or sweep for crystals/treasure) never exercises structure the software would have to know about — sequenced objectives ("the key first, then the vault") are just the DM declaring things in the order the fiction demands, across or within expeditions. If structure ever earns its way in, the shape would be an AND/OR graph (Dormans-style mission grammar), and the prep-facing half of it belongs to the Campaign Planner anyway.
- **A template marketplace or cross-set sharing.** Template Sets are per-user; templates are per-set (duplicate the set to fork). A public library is out of scope.
- **Automatic encounter resolution.** Generated contents *populate* a zone; the DM still runs combat through the existing encounter flow (one click to stage it, but staging ≠ resolving). No auto-rolling of outcomes.
- **Loot wired to character inventory.** Loot rows land in the DM manifest as narration fuel; awarding items to characters stays manual in v1. No zone-inventory system.
- **Player-facing generation.** Generation is a DM action; players only ever see revealed results through the existing snapshot. Hard requirement: a generated stub is **indistinguishable** from an authored unexplored exit in the watch.
- **Peek-without-commit.** There is no "preview this roll" affordance. Expanding a stub mints the zone (DM-side, unrevealed) — that *is* the peek, with commitment. If the DM hates the roll: **retract to stub** (a first-class operation — see *Generation at the table*) and force-pick.
- **Replacing the manual Map editor.** Hand-authored Maps remain first-class (the static dungeons *are* hand-authored Maps); procedural is an additional generation source, not a replacement.
- **Canonizing the new rules in the rules vault.** The feature ships two working procedures (exploration turn cost, wandering checks); porting them into the Obsidian rulebook as official rules is a follow-up for the vault, not this feature.

## Users & Context

The primary user is the **DM**, running the dungeon console live at the table. They prep by authoring a **Template Set** (room archetypes + tags + tables), a **seed Map** for the region (entrance plus any always-present skeleton), and the **static dungeons** as ordinary hand-drawn Maps — then bind seed Map + set into a campaign **Region**. During play they expand the region one click at a time as the party pushes into unexplored exits. The secondary audience is **players**, who see only the revealed Zone graph through the existing read-only watch — generation, contents manifests, and DM notes never cross the wire.

## Experience

**Prep.** The DM builds the *Drakkenheim* Template Set: Hallway, Plaza, Armory, Shrine, Haze-Bloom, Castle Entrance (a portal template), etc. — each a small form, not a canvas. They author set-level **tables** (Haze Ghoul Pack, Street Loot, City Wandering) referencing the enemy and item catalogs. They draw the **seed Map** (the city gate, maybe a fixed boulevard) and bind templates to any authored zones that should sprout procedural exits. They draw the **castle** and other static sites as normal Maps. Finally they create the campaign's **Region** — "Drakkenheim" — binding the seed Map to the set and designating the wandering table.

**Run.** The DM starts an expedition from the Region (an ordinary dungeon row under the hood). The delve-setup **site checklist** comes pre-ticked with the defaults (Castle Entrance, say); the party declares intent — *"we're finding the Reliquary today"* — and the DM ticks the Reliquary too: minimum depth 3, urgency "this session" (the template's authored defaults). Unexplored exits show as **silhouette stubs**. When the party pushes through one, the DM clicks to expand: the turn counter ticks, the engine rolls a legal template, mints the zone with its own stubs and rolled contents, DM-side only. The DM reads the manifest ("3 Haze Ghouls, a corpse clutching a locket"), narrates, and moves the party in — which reveals it to the watch, exactly like any zone today. Somewhere within the guarantee window, the expansion *is* the Reliquary. The shipped random-encounter reminder fires every few turns, now with a one-click roll on the City Wandering table. At turn 49, the existing Exhaustion reminders start to bite.

**The castle.** An expansion (or a force-placement from the discovered-sites list) produces **Castle Entrance**. The DM clicks *Enter* — the castle Map grafts into the running instance as new **pages**; the party walks through; the turn clock never notices. The castle arrives with last expedition's explored rooms already revealed: the building is stable, only the city shifts.

**Return.** The expedition ends (`done`) like any dungeon run. Next expedition: minted from the same Region, **different city**. The Reliquary — if still sought — is re-declared and guaranteed to re-generate, somewhere new. Castle Entrance sits in the Region's discovered-sites list, one click from existing again.

## The Model

### The Region

The **Region** is the one new cross-expedition object: campaign-scoped, owning exactly the state that must outlive a run —

- a reference to the **seed Map**,
- a reference to exactly **one Template Set** (no set-mixing in v1) — chosen at Region creation, so the seed Map's template bindings always resolve against a known set for the Region's whole life,
- the **discovered-sites list**,
- the **explored-state fold** for stable geography (`staticReveal` — which zones of the seed Map and of each static-dungeon Map the party has mapped; folded at expedition end, re-applied at start and at graft),
- the **wandering-table designation** and check cadence.

Expeditions are minted *from the Region* ("New expedition" on the Region), not assembled by hand each time. The Region deliberately owns **no clocks** — turn state lives and dies with the expedition, and campaign-level time belongs to the Campaign Planner.

> **Revised by technical design D5 (2026-07-08; re-decided 2026-07-16):** the 2026-07-08 session gave the Region a persistent shared MapInstance that every expedition visited. The 2026-07-16 implementation-readiness review reversed that — a shared mutable instance breaks expedition and encounter history identity (both are identified through their instance today). The Region instead owns **knowledge folds only**: `discoveredSiteKeys` plus `staticReveal` (per-source-Map explored state, folded at expedition finish, re-applied at expedition start and at graft). Expeditions keep ordinary per-run instances snapshotted from the live seed Map; generated space dies with the run **by construction** — no sweep, no re-sync, no shared spatial state.

### Expedition = dungeon row

An expedition is exactly one dungeon row: DM-opened, DM-closed (`draft → active → done`), one MapInstance, one turn counter. No new lifecycle object. The 48-turn budget, overtime Exhaustion reminders, and turn display already exist and are the clock this feature makes meaningful. Nothing mechanical crosses expeditions except what the Region owns.

### Template Sets

A **Template Set** is a first-class, user-owned, named entity (the same ownership shape as Maps: user-owned, campaign-agnostic). The Region reads the **live** set — no per-expedition snapshot — so tuning a weight or adding a template between (or during!) expeditions applies from the next generation roll onward. That is deliberate: live retuning is the authoring loop. The one guard on liveness: a template referenced by anything durable — a seed-Map binding, a pending objective declaration, a discovered-sites entry — cannot be hard-deleted; it **tombstones** (stops appearing in random rolls, keeps resolving existing references). Non-destructive edits are always fully live.

A **Zone template** declares:

| Field | Meaning |
|---|---|
| `name`, `description`, `dmNotes` | Content stamped onto minted zones. Multiple mints auto-disambiguate ("Hallway", "Hallway 2"); the DM renames freely in-console. |
| `tags` | What this template *is* (`[military, interior]`) — checked against neighbors' `accepts`. |
| `accepts` | What may sit adjacent (`[street, hallway]`). Legality is checked **both directions** at expansion. Template-level only in v1; the schema leaves room for per-exit accepts later (two-way door). |
| `exits` | An explicit list; each exit is required or `optional`. Optional exits may be culled at mint, giving variable connectivity without per-exit authoring. |
| `weight` | Spawn weight in the roll. |
| `unique` | At most one mint **per expedition** (the reshuffle model implies per-expedition, not per-region-lifetime). Unique + portal templates are the Region's **sites** (see *Sites, discovery & force-placement*). |
| Site defaults | For sites: **appear-by-default** (pre-ticked on the delve-setup checklist) and default **min depth** / **urgency** used when ticked or declared. |
| `portalMapId` | Optional: this template is a **portal** to a static Map (see *Pages & portals*). |
| Content rolls | Optional references: *chance* × *set-level table* (e.g. "20% → City Scavengers", "40% → Street Loot"). |

Adjacency is expressed **once per template**, never as O(N²) pairwise rules — the WaveFunctionCollapse socket idea flattened to template granularity. This is the graph-grammar pattern behind *Unexplored*, Spelunky's room templates, and Hades/Dead Cells room pools; complex interiors (the cathedral with a front door onto the Plaza) are explicitly *not* the target — those are static dungeons.

**Tables are set-level, named, and referenced** — authored once, used by many templates. A table row is: weight + entries, where an entry is an enemy ref × count (enemy catalog), an item ref (item catalog), currency dice, or free text ("a corpse clutching a locket"). One table concept, three uses: zone contents, loot, and the Region's wandering table.

**Authoring surface:** a **Template Sets** library section alongside My Maps — a list of sets, each opening a set editor of template forms and table forms. The editor includes a **set lint** (a v1 requirement, not a nicety): flags unsatisfiable accepts, warns when no always-legal connector exists (see *empty-pool fallback* below), checks portal targets exist, and checks a Region using the set has a wandering table designated. The Map editor is untouched except for two per-zone bindings (below).

### Generation at the table

**You pay to carve space, never to cross it.** The cost model is one predicate: does this expansion **mint new inhabitable space**? Minting a zone costs the party **one Dungeon Turn**; the console advances the turn counter as part of the expand gesture (adjustable, as ever, by the DM). Everything else is free: normal movement between explored zones (the rulebook's own rule, §2.2), backtracking, and loop closures (below) — connections are *doorways*, not places; you can't occupy the space between your living room and bedroom. The turn clock therefore measures exactly one thing: how much of the city the party has forced into existence. This is a new rule the feature ships, in the same spirit as the wandering procedure: it fills a rulebook gap (§2.2 defines a turn as "~10 minutes of careful exploration" — which carving into unknown streets is, and crossing mapped ones is not) and is what makes depth itself the resource — 48 turns bounds how far you can push, wandering checks accrue as you dig, and "we spend the morning pushing toward the castle" has a real price. Vault canonization is follow-up.

**Silhouette stubs.** A minted (or template-bound authored) zone sprouts its exits as stubs — "there's a passage here." **Hard requirement:** in the player watch, a stub is indistinguishable from an ordinary known-exit silhouette; players must never be able to tell generated from authored space (success criterion 3).

**Lazy roll, one gesture.** The template roll happens at **expansion click**, not stub creation. Nothing about the far side exists until the DM expands — which keeps state minimal, makes live set-retuning apply to every unexpanded stub, and keeps the DM surprised too. Expansion is one click: roll a template legal for the stub's socket (both `accepts` checks), mint the zone + connection + its own stubs, roll contents, auto-position sensibly. A context menu offers **force-pick** (choose the template, or a discovered site) using the identical minting path.

**Loop closure.** An expansion may resolve into a **connection to an existing zone** instead of a mint — "the alley bends and opens into the plaza you crossed earlier." Candidates are existing zones near the stub's projected position on the canvas (same page, both `accepts` checks pass, not already connected — the x/y layout supplies the "nearby" that a pure abstract graph lacks); when one exists, closure fires at a **per-set probability knob, defaulting low**. A closure mints nothing, so by the cost predicate it is **free** (no turn) and is **not a qualifying expansion** for objective draws — its only effect is spatial texture, so it can never break pacing or the guarantee. In the watch, the parent's silhouette resolves into a passage between two known places — indistinguishable from the DM revealing an authored hidden connection. Without closures the generated region is a pure tree; the knob is how street-like a set feels.

**Empty-pool fallback.** If tag filtering plus consumed `unique` templates leave a socket with zero legal candidates, the expand click must still resolve in one gesture: the set's designated **connector template** (an always-legal template the lint checks for — e.g. Hallway) mints instead; if the set has none, the stub resolves to a narrated **dead end** ("collapsed rubble" — stub removed, no zone). Never a dead click mid-session.

**Expand ≠ reveal.** The minted zone is DM-side only — generation is just an edit, like adding a node in edit view. Players see it when the DM moves the party in (`move → reveal`), or via the manual reveal toggle. This sequencing gives the DM a beat to read the manifest and narrate before the map updates — and is the only "peek" the feature offers (peek-with-commit; see Non-Goals).

**Retract to stub.** The reroll escape hatch is a first-class operation, not raw deletion: retracting an unrevealed generated zone unmints it and **restores the stub** — the parent's silhouette persists in the watch exactly as before, the turn spend stands, uniqueness/ledger effects reverse, and the DM force-picks or re-rolls on the restored stub. (Raw `deleteZone` would also destroy the player-visible connection — players would watch a passage vanish, breaking indistinguishability. It remains available for genuinely removing space.) Retract applies only while the zone is unrevealed; after reveal, the world happened.

**Hand-placed geometry is visit-scoped.** A zone or connection the DM hand-adds mid-run (the escape hatch) lives and dies with the expedition, exactly like generated space — the reshuffle keeps its promise, and session corrections never silently accrete into permanent geography. Space that should exist *every* expedition is authored where permanence already lives: the seed Map.

**The mint ledger.** One product law spanning every placement path: **any** mint of template T — random roll, force-pick, force-place, or objective draw — consumes T's per-expedition uniqueness and resolves any pending objective declaration bound to T. The UI disables paths the ledger has closed (a randomly-minted Castle Entrance greys out its force-place button; a force-placed Reliquary resolves the party's declaration).

**Depth.** The **entrance zones** are wherever the party is placed at delve start (depth 0 — placement is per-character, so a split start is legal). Authored zones take depth = graph distance from the *nearest* entrance zone (multi-source), computed at delve start; a minted zone's depth = its parent's + 1, assigned at mint.

**Auto-layout.** Generated zones must mint legible canvas positions (offset from the parent, no overlaps) without requiring DM cleanup. Algorithm is the design doc's problem; the requirement is product.

### Objectives: the pre-committed draw

Objectives are **declared per expedition**, and the primary declaration surface is the **site checklist at delve setup**: the Region's sites (its unique and portal templates), each tickable, pre-ticked according to the template's **appear-by-default** flag. Tick = declare; untick = the site takes its normal random chances (or none — see weight 0, below). Mid-run declaration ("Noted: the Reliquary") adds to the same list; it's one mechanism at two moments. A declaration binds the template with two knobs, **defaulted from the template** and tweakable per declaration:

- **Minimum depth** — the spatial fiction ("it's deep in the city").
- **Urgency** — a bound **K** on discovery, presented as presets ("this session" ≈ K=6, "eventually" ≈ K=15; exact values are a design-doc call). Since each expansion costs a turn, K also bounds the *turn spend* past min depth — urgency is literally a time budget.

The checklist makes over-declaring easy (six ticked sites at "this session" urgency claim most early qualifying expansions), so the console shows the count of pending draws; the fix is the DM's, not the software's.

At declaration the engine secretly rolls a placement index **N ∈ 1..K**, and the declared template is **withdrawn from the random pool** until the draw resolves (no lucky double-mint racing the draw). A **qualifying expansion** is a *zone-minting* expansion (loop closures neither qualify nor consume the count) whose minted zone would sit at depth ≥ min (parent depth + 1 ≥ min). The **Nth qualifying expansion** *is* the objective zone — and objective placement **overrides adjacency legality** (the socket's `accepts` is not consulted; the city bends to fate). That override is deliberate: it keeps the guarantee a counter, not a search, and the fiction absorbs it — the Haze put the Reliquary *here*. The contract:

- **Provable, collision-adjusted**: within K qualifying expansions **plus one per earlier-priority declaration that comes due on the same expansion** — an expansion mints one zone, so simultaneous dues resolve one per expansion, deterministically (see *Sequencing*, below). With no collisions — the common case — the bound is K, full stop. Testable with a counter either way.
- **Pacing-reliable**: K bounds session-time-to-discovery even if the party plateaus in depth, because qualifying expansions accumulate wherever they dig past min.
- **Path-agnostic steering**: wherever the party actually explores, that's where the objective lands.
- The console shows the objective as *"seeking — eligible past depth 3"* — never N, so the DM stays surprised (and can't unconsciously steer).

**Sequencing is social, not software.** If the fiction gates one site behind another ("find the key, then the vault"), the DM simply declares them in order — the second when the first resolves, or next expedition. No dependency modeling (see Non-Goals). Multiple *independent* declarations may run concurrently; when several come due on the same expansion, they resolve **one per expansion in a deterministic order** — force-placements (K=1) preempt, then declaration order — each deferred declaration landing on the next qualifying expansion. That deferral is exactly the collision adjustment in the bound above, and the console's pending-draws count is the over-declaration guard. The honest conditional, stated plainly: the guarantee is *"within K expansions past min depth"* (plus collisions) — a party that never pushes past the min never finds it. That's correct fiction (you must delve), and the console's objective status keeps the DM aware.

### Sites, discovery & force-placement

A Region's **sites** are its unique and portal templates — the checklist the delve-setup screen presents. Two per-template authoring knobs shape it: **appear-by-default** (pre-ticked each delve; the DM unticks to skip) and **weight**, where `weight: 0` composes into something useful for free — since ticked sites are withdrawn from the random pool and weight 0 never rolls, a zero-weight default-on site (Castle Entrance's exact profile: everyone knows it's there) appears *only* by choice, never by chance.

The Region also remembers **discovery**: sites the party has revealed at least once — authored or generated alike; a hidden authored site the party never found stays undiscovered — are annotated on the checklist (folded onto the Region at expedition end; product-equivalent to first-reveal, since the annotation only matters next expedition and `unique` blocks same-expedition re-placement) — "the party knows of: Castle Entrance, the Reliquary, …" — which is informational, not a gate; known-establishment sites are declarable without ever having been found. Mid-run, any site can be **force-placed**: the objective mechanism with **K=1** — *"the next expansion (or the next at depth ≥ D) is this site"*, preempting any other declaration due on the same expansion — or the DM picks a specific existing stub directly. Spatially coherent by construction (the site always arrives attached to the party's actual frontier), and "you spend the morning navigating by rumor" has a real price: the expansions along the way each cost their turn. Nothing about the *map* persists — only the memory of what exists.

### Pages & portals

**Pages** are a substrate addition to Map/MapInstance, valuable independent of this feature (multi-floor static dungeons want them with zero procedural content): a geometry is partitioned into named pages; every zone belongs to one; connections may **cross pages** (rendered as a "leads to Castle ⇢" chip on both ends, not a drawn line — each page is its own coordinate space, so authored and generated layouts never fight). The canvas renders one page at a time; editor, console, and watch get a page switcher; the watch lists only pages containing revealed zones and follows the **page of the party's most recent move** by default, manually overridable (a deliberate, page-granular exception to the watch's stay-put viewport behavior; with a split party, the last-moved token wins and the switcher covers the rest).

> **Prerequisite rider.** Pages touch the Map editor, canvas, instance schema, snapshot projection, and watch — a real change to a shipped substrate. It lands **first, as its own ticket(s)**, with procedural riding on top; the technical design specifies it.

**Portals** compose pages with generation. A portal zone (template-rolled, force-placed, or **drawn directly into any authored Map** — a per-zone `portalMapId` binding in the editor, useful even for fully hand-authored campaigns) references a static Map. The DM's *Enter* action **grafts** that Map's geometry into the running instance as new page(s), stitches the cross-page connection, and places the party at the Map's **designated entry zone** (a per-Map authoring field; the set lint checks every portal target has one). Grafting is **idempotent per static Map per expedition**: leaving and re-entering this expedition finds the same pages; a second portal to the same Map stitches a new cross-page connection, never duplicates. Re-entering *next* expedition re-grafts the Map fresh from its authored source — with the party's explored state re-applied from the Region's fold (tech design D5), so the product experience is the same stable, mapped building. Consequences, all by construction rather than by rule:

- **One expedition clock** — same dungeon row, so "without losing Dungeon Turn progress" is not a feature, it's the only possible behavior. (Resolves the draft's open question: one continuous clock, no second clock.)
- One console, one watch URL, one fog model.
- **Static interiors persist in the way that matters:** the *layout* is the authored Map (never reshuffles), and the party's mapping of it survives as Region knowledge — explored state folds to the Region at expedition end and re-applies at the next graft (tech design D5). This is the PRD's original reveal-copy model given a proper home: the knowledge lives on the Region, the one object with the matching lifetime.

### Contents & wandering encounters

When a template's content roll hits at mint, the zone gets a DM-only **contents manifest**: enemy refs + counts, loot rows, flavor text. The console renders it on the zone (never in the snapshot) with **one-click "stage this combat"** — pre-filling the existing encounter flow with those enemies in that zone. Loot stays narrate-and-award in v1.

The Region designates one set-level table as its **wandering table**, with a check cadence in turns. This **extends the shipped `random-encounter` reminder** (which already fires on a configurable interval) rather than building new plumbing — but the die stays in the DM's hand, per the feature's dice boundary: **the app rolls to fabricate the world; the DM rolls to play the game.** Generation randomness (templates, contents, closures, draws) is world-fabric and app-owned; an encounter *check* is a play event, and play events are rolled physically — both for the pleasure of real dice and for the DM's sovereign right to fudge. Concretely: the reminder's action opens the wandering-table panel, which displays the table's rows with **d100 ranges derived from their weights** (weights stay the authored truth; ranges are a projection). The DM rolls a real d100 and clicks the row it landed on — or any other row, or dismisses; the click is the DM's declaration, never the app's verdict. The chosen row becomes a stageable result like any manifest — staged **into the zone containing the party** (DM picks the zone when the party is split). This fills the rulebook's "the DM periodically checks" gap with an actual procedure; canonization in the vault is follow-up work.

### The seed Map & authored-zone bindings

The seed Map is an **ordinary Map** — no special subtype. The DM draws the entrance area and any always-present skeleton; delve start snapshots it exactly as today; generation extends it. The procedural nature comes from the Region binding, not from the Map. A DM who authors a big fixed skeleton and a small set gets a mostly-static region — a feature, not a smell.

Authored zones join the grammar via **template binding** ("this authored zone *is a* Plaza") — the same which-template-minted-me field a generated zone carries, so authored-bound and generated zones are one shape downstream (discovered-sites, the mint ledger, stub-sprouting, contents). Bindings resolve against the Region's set (stable for the Region's life; tombstoning protects them from deletion). The binding supplies grammar identity (tags — required for legality when rolling neighbors), the exit list, and optionally contents:

- Already-drawn connections **consume the exit budget**: a 4-exit Plaza drawn with 1 authored connection sprouts 3 stubs. Authored connections beyond the budget are simply legal — authored trumps grammar.
- An **unbound** authored zone is inert: never sprouts stubs, and passes adjacency implicitly ("anything may touch it") so hand-drawn skeletons don't fight the legality checker.
- Content rolls on bound authored zones default **off**, with a per-zone "roll contents at delve start" toggle — authored zones usually have authored purpose; surprise ghouls in the carefully-placed entrance is nobody's intent.

## Success Criteria

The feature is done when, on a real Drakkenheim set:

1. The DM authors a Template Set (~15–25 templates + tables, passing the set lint) and a seed Map, binds them into a Region, and runs a **complete expedition loop** — declare objective → delve → expand-as-explored (turn counter ticking per expansion) → find the objective within its K-draw guarantee → enter a static dungeon via portal page-graft → return → end expedition — entirely from the console, with hand-editing never *required* but available throughout as override.
2. A second expedition from the same Region produces a **different layout** (reshuffle verified), with the site checklist (discovery-annotated, defaults pre-ticked) and K=1 force-placement carrying the party's knowledge forward.
3. Players at the watch **cannot distinguish** generated from authored space — including across a retract-to-stub — and never receive unrevealed zones, stub internals, contents manifests, or DM notes; enforced in the same release-gate style as the existing snapshot redaction test.
4. Every generation act (expand, force-pick, force-place, retract, objective placement, contents roll, wandering roll) resolves in **one DM gesture** on the hot path — no modal ceremony and no dead clicks (empty-pool fallback included) mid-session. Combat staging is one gesture **to the prefilled dialog**: staging pre-populates the existing encounter form, and its confirm is the natural pre-combat pause ("actually only 2 ghouls attack"), not ceremony.
5. Generated zones position themselves legibly (no overlaps) without DM cleanup being required.

## Resolved Questions

Decisions from the 2026-07-07 design session and critique pass, superseding the draft's open questions:

- **Landmark persistence: removed.** The city fully reshuffles; knowledge persists via objectives + the discovered-sites list. (Was the draft's core "Return & persistence" pitch; deliberately reversed — the fiction is better and the hardest machinery disappears.)
- **The Region object** owns all cross-expedition state (seed Map + set binding, discovered sites, wandering designation); expeditions are minted from it. (Critique finding: this state previously had no home.)
- **Template scope: user-owned Template Sets**, one per Region, live-read with tombstone protection for referenced templates, no mixing, no cross-set sharing.
- **Exploration costs a turn** — expanding into unexplored space = 1 Dungeon Turn, auto-ticked by the expand gesture; backtracking through explored space stays free per §2.2. (New rule; replaces the unbacked "travel costs turns" framing.)
- **Clock semantics across portals: one continuous clock**, by construction (pages, single dungeon row); grafts are idempotent per static Map per expedition, with explored state carried across expeditions by the Region fold (tech design D5, revised 2026-07-16).
- **Expedition reset cadence: generated space resets; authored knowledge persists** (tech design D5, 2026-07-08; re-decided 2026-07-16): each expedition snapshots the *live* seed Map into its own instance — generated and hand-added space die with the run by construction, and Map edits arrive next expedition automatically. What crosses expeditions is knowledge on the Region: `discoveredSiteKeys` and the per-source-Map explored-state fold (`staticReveal`), re-applied at start and at graft. The 2026-07-08 persistent-shared-instance model was reversed in implementation review — it broke expedition/encounter history identity, and every repair was machinery serving the shared instance rather than the product.
- **Quest modeling: removed entirely** (was "linear + lock-and-key, DAG-ready schema"). Walking the actual campaign through the feature showed every quest shape reduces to "make this node appear this expedition" — the declaration mechanism *is* the quest support; ordering is the DM declaring in sequence. YAGNI'd in the same pass as landmarks.
- **The dice boundary** (2026-07-08, tech-design session): the app rolls to fabricate the world (templates, contents, closures, draw indices); the DM rolls to play the game (encounter checks, and everything else the rules put a die on). Wandering checks are therefore DM-rolled against derived d100 ranges, never app-rolled — superseding this PRD's earlier "one-click roll" wording.
- **Declaration generalized to the site checklist** — delve setup presents all sites (unique + portal templates), pre-ticked per appear-by-default, discovery-annotated; tick = declare with authored defaults. Weight-0 + default-on = appears only by choice (Castle Entrance). One mechanism behind setup ticks, mid-run declarations, and K=1 force-placement.
- **Adjacency granularity: template-level tags/accepts**; per-exit accepts is a schema-compatible later extension. Generated space is tree-shaped with **loop closures in v1** (per-set probability, default low): a closure is a doorway, not a place — free, non-qualifying, pure spatial texture.
- **The cost predicate: pay to carve, never to cross.** Turn cost attaches to zone-minting expansions only; movement, backtracking, and loop closures are free.
- **Roll timing: lazy, at expansion**; no peek-without-commit; **retract-to-stub** (not raw delete) is the reroll path; force-pick is the control surface; empty candidate pools fall back to the connector template or a narrated dead end.
- **Objective guarantee: pre-committed draw** (secret index N ∈ 1..K over qualifying expansions, where qualifying = minted-zone depth ≥ min), replacing a probability ramp. Declared templates leave the random pool; placement overrides adjacency; the **mint ledger** unifies uniqueness and declaration resolution across all placement paths. **Force-place = the same draw with K=1**, preempting other declarations due on the same expansion. Simultaneous dues defer deterministically (declaration order), adjusting the bound by one per collision (2026-07-16 — the earlier "within K, full stop" claim was unsatisfiable for colliding declarations).

## Open Questions (for the technical design)

- **Pages schema & migration** — page shape on geometry/instance, cross-page connection rendering, editor/console/watch switcher, snapshot projection changes. (The prerequisite rider.)
- **Region schema** — the binding object's shape and its relationship to dungeon-row minting.
- **Reveal-seeding mechanism** for grafted static pages (how the last expedition's reveal state for a given Map is found and copied).
- **Retract-to-stub realization** — how unminting composes with the instance event vocabulary and the ledger.
- **Auto-layout algorithm** for minted zones (offset heuristics, collision avoidance).
- **RNG discipline** — seeding, audit/replay of rolls, where randomness lives relative to the pure engine.
- **Urgency presets** — concrete K values, and whether K is exposed raw or presets-only.
- **Generation vocabulary** — whether expansion is one composite instance event or a transaction of existing `editGeometry` events + new content events; set-lint rule details.
- **Loop-closure heuristic** — the candidate radius R, how "projected stub position" is computed relative to auto-layout, and the default closure probability.
