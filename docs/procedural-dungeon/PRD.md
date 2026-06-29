# Procedural Dungeon (Drakkenheim) — PRD

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here. Last ported from Linear: 2026-06-29.

**Status:** Draft · **Owner:** Jackson · Companion to the **Procedural Dungeon Architecture ADR** ([ADR.md](./ADR.md))

## Overview

This feature turns dungeon exploration into a **procedurally generated, roguelike-feeling experience** built on the system's existing **Zone graph** — the abstract, grid-free unit of space the Map editor and dungeon run console already use. The motivating campaign is *Dungeons of Drakkenheim*: a post-apocalyptic city warped by a magically radioactive meteor, where factions and NPCs all race the party toward the crown in the castle throne room. The official module's weakness is that **exploring the city is thinly detailed**; this feature replaces flat "you wander the ruins" narration with a city that is **generated as you explore and different every expedition** — the Tartarus (Persona 3) / Mementos (Persona 5) feel, where the connective space reshuffles but the landmarks endure.

The pitch in one line: **make Dungeon Turns bite.** When the route through the city is always novel and dangerous, the turn clock — travel, attrition, faction pressure — becomes a real resource the party spends, not bookkeeping.

This is feasible here precisely because the system has **no grid**. Procedural *grid* dungeons must solve a 2D packing/pathfinding problem (rooms can't overlap, corridors must physically connect). A Zone graph has none of that: generation is just *adding nodes and edges to a graph*. The system's spatial substrate is, by happy accident, the ideal substrate for this.

## Goals

- Let a DM author **Zone templates** (room archetypes — Armory, Hallway, Cathedral) with connection rules, and have the engine **stitch them into a fresh, legal Zone graph** each expedition.
- Generate **just-in-time**: the DM expands the map as the party explores, rather than pre-rolling the whole city — generation rides the existing reveal/fog mechanic.
- Support **loot and encounter tables** on templates ("20% of Hallways contain enemies from this table"), so generated space carries generated content.
- Reconcile procedural space with **authored quests**: faction quest locations and items must be *guaranteed to appear, reachable, and winnable* without the DM hand-placing them.
- Keep the module's **static, handcrafted dungeons** (the castle and a handful of others), reached *through* the procedural city, **without losing Dungeon Turn progress** at the boundary.
- Make exploration **persistent where it should be**: discovered landmarks stay fixed across expeditions; undiscovered connective tissue stays fluid.
- Preserve a **DM manual override** at every step (force a specific template, hand-place a node) as an escape hatch, never the primary path.

## Non-Goals (v1)

- **Grid / tactical positioning.** This rides the existing abstract Zone model; no tiles, no movement ranges.
- **Branching quest prerequisite chains** ("bribe the guard *or* find the sewer key"). v1 handles **linear** fetch quests and simple lock-and-key. The data model leaves room for a dependency DAG (see ADR), but the generator only resolves the linear case.
- **A shared, cross-campaign template marketplace.** Templates are DM-authored content; whether they're global-to-a-user or per-Map is an open question (see ADR), but a public library is out of scope.
- **Automatic encounter resolution.** Generated encounters *populate* a Zone (enemies/loot present); the DM still runs combat through the existing tracker. No auto-rolling.
- **Full mission-graph-first generation** (Dormans-style). Deferred until branching quests actually materialize; v1 is anchored-objective placement.
- **Player-facing generation.** Generation is a DM action; players only ever see revealed results through the existing player snapshot.
- **Replacing the manual Map editor.** Hand-authored Maps remain first-class (the static dungeons *are* hand-authored Maps); procedural is an additional generation source, not a replacement.

## Users & Context

The primary user is the **DM**, running the dungeon console live at the table. They prep by authoring a **template set** (room archetypes + adjacency rules + loot/encounter tables) and any **static dungeons** as ordinary hand-drawn Maps, then bind **quests** (placement contracts) to an expedition. During play they click to expand the city as the party pushes into unexplored exits. The secondary audience is **players**, who see only the revealed Zone graph through the existing read-only snapshot — generation and DM notes never cross the wire.

## Experience

**Prep.** The DM builds a *template set* for Drakkenheim: Hallway, Plaza, Armory, Kitchen, Shrine, Haze-Bloom, etc. Each template declares its **exits** (with adjacency tags), a **spawn weight**, optional **unique** flag, and optional **loot / encounter tables**. They draw the **castle** and other static sites as normal Maps. They define the city's **quests** — e.g. "find the Reliquary (a place) and recover the Dawn Shard (an item) within it."

**Run.** The party enters the city at an entrance Zone. Unexplored exits show as **silhouette stubs** ("there's a passage here"). When the party pushes through one, the DM clicks to expand it — the engine rolls a legal template for that stub, mints the Zone and its connection, rolls its contents, and reveals it. The party explores outward; the city takes shape under them and is **different from last expedition**. Anchored quest locations are **guaranteed to appear** before the depth budget runs out, steered gently toward the party's actual path. Reaching a **portal node** (e.g. "Castle Entrance") walks the party into a **static dungeon** — the turn clock keeps ticking.

**Return & persistence.** Discovered **landmarks** (quest sites, the castle entrance, notable rooms) become **permanent** — same place next expedition. The **filler** between them regenerates. The party builds a real mental map of anchors in a city whose streets keep shifting — exactly the Haze's fiction.

## Generation Model (summary)

The technique is a **graph grammar / generative grammar** — the well-trodden PCG pattern behind *Unexplored* (Dormans), Spelunky's room templates, and Hades/Dead Cells room pools. Templates are the grammar's productions; **adjacency tags** are its sockets (the WaveFunctionCollapse idea: each exit carries a tag, each template declares which tags it accepts, so "Armory can't touch Kitchen but both touch Hallway" is expressed *once* per template, never as O(N²) pairwise rules). Full mechanics — JIT-as-reveal, the depth budget, unique-node reservation, quest-as-constraints, lock-and-key ordering, persistent landmarks, and the portal/expedition model for static dungeons — are specified in the **ADR** ([ADR.md](./ADR.md)).

## Open Questions

- **Template scope:** global-to-a-DM (reusable across campaigns) vs. per-Map? Affects authoring UX and where the data lives.
- **Clock semantics across portals:** does the turn clock simply *continue* into a static dungeon, or does the city's corruption clock and the dungeon's own pacing want to be two clocks? v1 assumes one continuous expedition clock.
- **Quest branching:** confirmed linear for v1; the schema stays DAG-ready so this is a two-way door (see ADR, *Reversibility*).
- **Expedition reset cadence:** does the whole city reset per expedition (Mementos) or only the filler regenerate while landmarks persist? PRD assumes the latter.
