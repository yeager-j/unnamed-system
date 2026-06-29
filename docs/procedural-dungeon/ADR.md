# ADR: Procedural Dungeon Architecture

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here. Last ported from Linear: 2026-06-29.

**Status:** Draft · **Owner:** Jackson
**Related:** [Procedural Dungeon — PRD](./PRD.md) · [Dungeon Map ADR](../dungeon-map/ADR.md)

---

## Context

The system already has the spatial substrate this feature needs, built for the dungeon-map / dungeon-run work:

- **`MapGeometry`** (`packages/game/src/foundation/map/geometry.ts`) — `zones: Record<string, MapZone>` + `connections: Record<string, MapConnection>`. Zones are graph nodes; connections are undirected edges carrying `hidden` / `locked` flags.
- **`Map`** (`apps/web/lib/db/schema/map.ts`) — a DM-authored, reusable geography (the template), `geometry jsonb`, version-guarded.
- **`MapInstance`** (`apps/web/lib/db/schema/map-instance.ts`) — a runtime *snapshot* of a Map plus `occupancy`, `reveal: RevealState`, and enchantment. Editing the source Map never reaches a live instance.
- **`Dungeon`** (`apps/web/lib/db/schema/dungeon.ts`) — the temporal wrapper over **one** `mapInstanceId`; owns `DungeonState` (`turnCounter`, `actedCharacterIds`, reminder settings). Pure turn-loop reducer `reduceDungeon` in `packages/game/src/engine/dungeon/`.
- **Reveal / fog** — `RevealState` (`revealedZoneIds`, `revealedConnectionIds`, `unlockedConnectionIds`); `projectPlayerSnapshot` redacts the instance down to what spectators see (revealed zones + known-exit silhouettes, no DM notes).

The engine is **pure, deps-first, layered** (`foundation → data → engine`); reducers are exhaustive `switch` with no `default`, Immer-drafted, caller mints ids.

The design problem: generate a fresh, legal Zone graph each expedition; carry generated loot/encounters; satisfy **authored quests** in procedural space without unwinnable layouts or DM hand-placement; and reach **static handcrafted dungeons** through the city **without losing the turn clock**.

---

## Decision summary

| # | Decision | Choice |
| -- | -- | -- |
| 1 | Generation technique | **Graph grammar / generative grammar.** Templates are productions; the generator stitches a `MapGeometry` from them. Settled-science PCG (Dormans / Spelunky / WFC sockets), not a bespoke algorithm. |
| 2 | Adjacency rules | **Tag/socket model, not pairwise.** Each exit carries adjacency **tags**; each template declares accepted tags. "Armory ✗ Kitchen, both ✓ Hallway" is expressed once per template — O(N) authoring, no drift. |
| 3 | Generation cadence | **Just-in-time, riding the reveal mechanic.** An unexpanded exit is an open *stub*; expanding it *is* the reveal event — roll a template, mint zone+connection, roll contents, reveal. No pre-roll. |
| 4 | Randomness placement | **RNG at the composition root, never in the reducer.** The generator (pure, deps-first: seeded RNG + template catalog) decides the concrete zone; the existing `addZone`/`addConnection` runtime events persist the already-decided data. Reducers stay deterministic. |
| 5 | Termination | **Depth/zone budget per expedition** + **reserved-slot placement** for unique/objective nodes (never roll-and-pray for guaranteed content). |
| 6 | Quests | **Quest-as-constraints (Level 1: anchored objectives).** A quest is a bundle of **placement contracts** (zone / loot / occupant, each with depth + ordering constraints) handed to the generator; its contract is "satisfy these, fill the rest, never produce an unwinnable layout." |
| 7 | Quest items | **Lock-and-key ordering.** A key (quest item) is guaranteed to appear *before* its lock (objective) along the traversal path. Expressed as a dependency **relation between contracts**, resolved in one place. |
| 8 | Quest schema shape | **DAG-ready, linear-resolved.** Contracts carry an optional `dependsOn` edge set; v1 resolves only linear chains. Keeps Level 1 → Level 2 a two-way door (see *Reversibility*). |
| 9 | Discoverability | **Soft steering + breadcrumbs.** Anchoring guarantees a node *exists/reachable*, not that players *find* it. Bias which stub the objective attaches to toward the party's path; seed diegetic clues. A JIT *deadline*: when open stubs ≈ unplaced objectives, force placement. |
| 10 | Static dungeons | **Hand-authored Maps + portal connections.** A static dungeon is an ordinary authored `Map`; "static vs procedural" is a property of the **source Map**, decided once. A **portal** is a connection whose target is *another Map's entrance zone*. |
| 11 | Turn clock across portals | **Lift the clock onto the Expedition.** The `Dungeon`/Expedition owns the clock + roster + a `currentMapInstanceId` and references *several* instances. Crossing a portal moves the pointer; the clock keeps ticking. |
| 12 | Persistence | **Persistent landmarks, fluid filler.** Discovered landmark/objective/portal zones become `permanent`; undiscovered filler is pruned and re-generated on re-entry. Anchoring and persistence are the same flag viewed two ways. |

---

## 1. Generation: graph grammar over the Zone graph

The generator is a **pure function** producing `MapGeometry` fragments:

```
generateZone(rng, catalog) => (geometry, stub) => { zone: MapZone, connection: MapConnection, contents }
```

It is the canonical **graph-grammar** PCG pattern: templates are the grammar's productions, the existing Zone graph is the output. Because the substrate is a graph, generation never touches geometry/packing — it adds nodes and edges. Canvas layout (`position`) is auto-assigned (dagre/elk) after the fact; it has no semantic role.

A **`ZoneTemplate`** is new DM-authored content (parallel to `Map`):

```
ZoneTemplate {
  id
  name                 // "Armory", "Hallway", "Reliquary"
  weight               // spawn frequency
  unique: boolean      // appears at most once; if required, also guaranteed
  role: "normal" | "entrance" | "objective"
  exits: ExitSocket[]  // each carries adjacency tags
  descriptionPool      // player-facing text variants
  dmNotesPool          // DM-only variants
  encounterTable?      // weighted entries + trigger chance
  lootTable?           // weighted entries
}

ExitSocket { tags: string[] }   // accepts templates offering a matching tag
```

## 2. Adjacency: sockets, not pairwise rules

Pairwise "X may/may not connect to Y" is O(N²) and drifts every time a template is added — and it violates *decide a distinction once* (CLAUDE.md #9). Instead each exit is **tagged** and each template **accepts tags**:

- Armory exits → `industrial`; Kitchen exits → `domestic`; Hallway exits → `[industrial, domestic, transitional]`, accepts all.
- Armory and Kitchen can't touch (no shared tag); Hallway bridges them; a new `industrial` "Forge" needs zero edits elsewhere.

The tag is the parameter ("vary the noun by parameter"); the matching logic is one function.

## 3. JIT generation *is* the reveal

The reveal mechanic already distinguishes a fully-revealed zone, a **known-exit silhouette** (you see *that* an exit exists, not what's behind it), and stripped/undiscovered space. An **unexpanded exit is a silhouette stub**. Expanding it is the generation event:

1. Party pushes into a stub → DM reveals it.
2. Generator picks a template whose entrance offers a tag the stub accepts, weighted by `weight`, excluding placed `unique`s.
3. Mint the zone + connection (caller-minted ids, per convention), roll loot/encounter tables.
4. Write into the live `MapInstance.geometry` (version-guarded blob) and reveal.

Reveal and generation are the same gesture — roguelike-correct, and it means **persistence is free**: the `MapInstance` snapshot *is* the record of how the city came out this run. A stored seed is optional (only needed for pre-roll/replay); the instance is the source of truth.

## 4. Termination & guaranteed content

Pure growth never stops and never guarantees the throne room. So:

- **Depth/zone budget** per expedition bounds growth.
- **Unique/objective templates are reserved, not rolled.** A required node occupies a reservation the generator must satisfy before the budget exhausts — see quests below.

## 5–9. Quests as constraints

The DM manual-place is the **escape hatch**, not the pattern. The real pattern: **quests don't generate space — they constrain it.** A **Quest** is a bundle of **placement contracts**:

- **Quest *location*** (the Reliquary) → an anchored `unique` zone (`role: "objective"`), guaranteed reachable, placed by a depth bound.
- **Quest *item*** (the Dawn Shard) → **loot injected** into a zone (often the objective's); does not need its own room.
- **Quest *NPC*** → an **occupant** placed in a zone.

These are three distinct contracts (decide the distinction once), not one monolithic "goal."

**Lock-and-key.** A key contract must resolve *before* its lock along the traversal path, or the layout is unwinnable. Expressed as a **dependency relation** between contracts, resolved by a single topological pass. v1: linear chains only (a one-edge DAG: "key depth < lock depth"). The constraint logic lives in **one** resolver function — *not* scattered `keyDepth < lockDepth` comparisons in the generator — so generalizing to arbitrary DAGs later is localized.

**Discoverability ≠ existence.** Anchoring guarantees the node is *in the graph and reachable*, not that players *find* it. Two well-trodden fixes:

- **Soft steering** (the L4D "AI Director" move): bias which open stub the objective attaches to toward the direction the party is actually exploring.
- **Breadcrumbs**: seed diegetic clues in filler zones; the quest-giver's intel *is* the hint system.

The JIT cadence gives a clean **deadline**: track open stubs vs. unplaced required objectives; when they're about to run even, force the next zone on the party's path to be the objective. Required content can't get lost in the budget.

> **Level 2 (deferred): mission-graph-first.** For *branching* prerequisite chains, the rigorous pattern (Dormans) is to author the mission as a DAG and realize a space that satisfies it (space serves story). v1 stops at Level 1; the schema (#8) leaves the door open.

## 10–11. Static dungeons: portals + an expedition that owns the clock

The naive approach — "reach Castle Entrance → DM manually swaps to a new Dungeon" — works but is the *escape hatch* again: manual, and it **loses turn progress** because the clock is welded to one `mapInstanceId`. The real pattern is the **hub-and-spoke / overworld→dungeon** structure (Zelda, Hades, Pokémon). Two refinements make it clean:

**A. A portal is a connection, not a swap.** Generalize `MapConnection` so an exit can target *(another Map's entrance zone)*. Traversing it is the existing `moveParty` mechanic across an instance boundary; first traversal lazily mints the target Map's instance (exactly how `MapInstance` is already minted from a `Map`). The "Castle Entrance" template carries this portal exit — no manual table-time work.

**B. Lift the clock onto the Expedition.** Today `Dungeon` owns `turnCounter` and points at one `mapInstanceId` — that coupling is *why* entering the castle costs the clock. Break it:

- An **Expedition** (the `Dungeon`) owns the clock + roster + a **`currentMapInstanceId`** pointer and **references several** MapInstances (city, castle, other sites).
- Crossing a portal moves the pointer and party tokens; **the clock keeps ticking** — which is also more thematically correct, since Drakkenheim's corruption/faction pressure is a campaign-wide clock that *should* follow the party into the throne room.

Reveal/occupancy stay **per-instance**, so each location remembers its own fog: walk back out of the castle and the city is exactly as you left it.

**"Static vs procedural" is decided once, at the source Map.** The castle is a hand-drawn `Map`; the city is a `Map` with a generator attached. Both mint `MapInstance`s and run through the identical reveal/turn/snapshot machinery. The run console never branches on "is this procedural?" — the distinction is resolved at the Map boundary and everything downstream is blind to it.

## 12. Persistence: landmarks fixed, filler fluid

Quests imply returning (factions send you back; you'll want that shop again). The strongest model for Drakkenheim's fiction ("the Haze warps the streets, but the great structures endure"): **once discovered, a landmark/objective/portal zone becomes `permanent` and survives between expeditions in the same graph position; undiscovered filler is pruned and re-generated on re-entry.** The Castle Entrance is the ultimate persistent landmark, with a static instance behind it. Anchoring (a quest node must exist) and persistence (a discovered node must endure) are the **same `permanent` flag** seen from two angles.

---

## Where the code lands

| Concern | Home | Pattern |
| -- | -- | -- |
| Pure generator | `packages/game/src/engine/map/generate-zone.ts` (new) | Deps-first: `(rng, catalog) => (geometry, stub) => …`; emits data, dispatches existing events |
| Template catalog | `packages/game/src/data/` behind the `GameData` port (if catalog lookups needed) | Weighted-pick helpers |
| Template content | new `zone_templates` table (parallel to `maps`), DM-owned | version-guarded jsonb |
| Quest constraints | `packages/game/src/engine/map/` resolver (new) | Single topological pass; DAG-ready, linear-resolved |
| Portal connection | extend `MapConnection` (foundation) + `reduceMapInstance` movement | target resolves to another Map → lazily minted instance |
| Expedition clock | `Dungeon` schema: drop single `mapInstanceId`, own clock + `currentMapInstanceId` + instance set | the load-bearing schema change |
| Persistence flag | `permanent` on `MapZone` / reveal | landmark survives re-generation |

---

## Reversibility (one-way vs two-way doors)

The conversation that produced this doc kept returning to *which decisions lock us in*. Summary:

- **Two-way (cheap to change later):** the generator algorithm (pure function, swappable; output is the same `MapGeometry` either way — consumers insulated); adjacency tags; JIT cadence; portals (purely additive to `MapConnection`).
- **Two-way *if pinned now*:** the **quest schema** (#8). A flat contract list locks you into Level 1; a DAG-ready shape (optional `dependsOn`) costs one field today and keeps the mission-graph upgrade additive instead of a content migration. Pin it open from day one.
- **The real hinge (do early):** **lifting the clock onto the Expedition** (#11). "Dungeon owns one instance" vs "owns many + a current pointer" is a data-model decision that's annoying to retrofit once dungeons are persisted. Even if v1 ships the simple per-site swap, model `Dungeon` as owning the clock *independently of any single instance* so multi-instance stays a two-way door.

---

## Open questions

1. **Template scope** — global-to-a-DM vs. per-Map. Affects the `zone_templates` ownership column and authoring UX.
2. **One clock or two across portals** — v1 assumes one continuous expedition clock; a separate in-dungeon pacing clock is possible later.
3. **Expedition reset cadence** — confirmed: filler regenerates, landmarks persist (not full Mementos reset).
4. **Seed storage** — defer unless pre-roll/replay is wanted; the `MapInstance` snapshot is the source of truth.
