# Procedural Dungeons — Technical Design

> **Canonical source.** Companion to the [PRD](./PRD.md); this document absorbs the ADR role the PRD's early drafts referenced. Product behavior lives in the PRD; this is how it's realized. Designed 2026-07-07/08.

**Status:** Accepted (design session 2026-07-07/08; validated 2026-07-08 — an architecture fact-check against post-UNN-540 main plus an adversarial review, 27 findings folded in; **revised 2026-07-16** — a second implementation-readiness review against main `f1599f3d`, 13 findings verified: D5 re-decided as knowledge folds over per-expedition instances, replacing the persistent shared instance; D3's migration rationale and D10's wire-shape claims corrected against the shipped Visual Overhaul; the concurrency/lifecycle contract tightened into a new D11; the build order re-sequenced) · **Owner:** Jackson

**Prerequisites & dependencies:**

- **Exploration on game-v2 — done.** UNN-540 (PR #299) shipped the exploration cutover; the v1 spatial engine is deleted. Everything below targets `packages/game-v2` (`spatial/` + a new `generation/` domain).
- **Campaign Planner shell — lands first.** Region surfaces mount inside the overhauled campaign shell (expected `/campaigns/[id]/regions`, alongside `/campaigns/[id]/dungeons`); this design does not commit campaign-side routes. Cross-expedition *time* (days, factions) stays the Planner's; the two features share only the Campaign container.

## 0. The through-line: one lifetime per fact

The PRD's design sessions kept converging on "derive, don't store" / "decide a distinction once." This document's version: **every fact lives exactly one lifetime, on the object with that lifetime.**

- **Authored** facts (template definitions, seed geometry, zone↔template bindings, growth modes) live on user-owned rows (`map`, `templateSet`) and are *referenced*, never copied-and-mutated.
- **Place** facts — the knowledge that outlives a visit: which sites are discovered, which zones of each stable building the party has mapped — live on the **Region** as two small folds (D5, the load-bearing decision). Spatial *state* never outlives a visit; stable layouts are re-derived from their authored Maps every expedition.
- **Visit** facts (turn counter, draw ledger, occupancy, generated zones, stubs, manifests — and the instance itself) live on the **expedition** (dungeon row) and die with it; nothing is swept because nothing shared survives.
- **Derived** facts are never stored: cross-page-ness (from endpoints), d100 ranges (from weights), the inward growth vector (from the seed skeleton), stub silhouettes in the snapshot (from stubs), site-checklist annotations (from `discoveredSiteKeys`).

Two predicates decided once and consumed everywhere:

- **Mints-new-space?** → costs a Dungeon Turn, counts as a qualifying expansion (PRD's carve-vs-cross).
- **Authored-or-generated?** (per-zone provenance) → whether a zone's reveal folds back to the Region at finish (authored zones fold to their source Map's `staticReveal` entry; generated and hand-added zones die with the visit) and whether retract may target it (generated only).

And one boundary from the PRD, restated because it splits this document's RNG design in half: **the app rolls to fabricate the world; the DM rolls to play the game.**

## 1. Decisions

### D1 — Server-resolved rolls; the engine stays pure

Every generation roll resolves in a Server Action, never on the client. The action is a thin impure shell — load, call the pure engine, commit via `guardMany` — and the pure core lives in `packages/game-v2/src/generation/`:

```ts
rollExpansion(deps: { set, instanceState, ledger, rng }): Result<{
  instanceEvents: MapInstanceEvent[]   // mintZone | closeLoop — fully resolved
  dungeonEvents: DungeonEvent[]        // advanceTurn + ledger events
}, ExpansionError>
```

The returned events are **deterministic** — the roll happened inside `rollExpansion`; reducers replay them without consulting randomness. Engine isomorphism holds where it's load-bearing (both sides re-derive state through the same reducers); only the roll itself is server-owned, and a roll was never re-derivable.

Consequences accepted: the expand gesture is the console's one **non-optimistic** spatial write (pending state on the stub node during the round trip — DM-paced, sub-second; `searchReveal`/`finishDelve` set precedent for non-optimistic gestures). In exchange: one authoritative draw ledger, a seedable RNG port, and the K-guarantee property-tested by driving thousands of seeded expeditions through the pure function.

### D2 — Storage: Template Set as a Map-pattern blob; Region as a real table

- **`templateSet`** copies the Map storage pattern verbatim: one row (`userId`, `shortId`, `name`, `version`) with a single `content` jsonb blob (templates + tables keyed by stable slugs), whole-blob autosave through the one version token. Relational template rows were considered and declined: the references that would want FKs live *inside other blobs* (map geometry, instance state), and the snapshot philosophy is deliberately anti-FK (an expedition must keep rendering a template its author deleted). Integrity lives at the boundaries instead — set lint at authoring time, zod + graceful degradation at load time ("unknown template" renders, never crashes), tombstones for liveness.
- **`region`** is a real table (campaign-scoped, referenced by dungeon rows): FKs `campaignId` (cascade), `seedMapId` (restrict), `templateSetId` (restrict). The restrict FKs make tombstoning concrete: a Map or Set a Region depends on cannot be hard-deleted. The Region owns **no instance** — expeditions mint their own (D5); its cross-expedition memory is two jsonb folds, `discoveredSiteKeys` and `staticReveal`.
- **Template-level tombstone** is a flag inside the set blob: a tombstoned template stops appearing in random rolls and the site checklist but keeps resolving existing references (bindings, provenance, discovered sites). The editor offers tombstone where delete would dangle; lint reports danglers.

### D3 — Pages: derived cross-pageness, one-time migration, page-scoped canvas

- `geometry.pages: Record<pageId, { id, name, growth?: "edge" | "open" }>`; every zone gains a required `pageId`. Connections gain **nothing** — a connection is cross-page iff its endpoints' zones are on different pages, derived at render (a stored `crossPage` flag would be a second decider). Cross-page connections render as "leads to ⇢" chips on both zone nodes; clicking a chip navigates to the far page and focuses the linked zone — the same affordance the console and watch use to *follow* a portal.
- **Migration:** one-time SQL migration stamps a default page into every existing `map.geometry` and `mapInstance.state.geometry` blob; the schema then *requires* `pageId`. (Lazy parse-time normalization was declined — on **corrected grounds** (2026-07-16): the canonical loaders *do* zod-parse every blob on read (`load-map.ts`, `map-instance.ts`, `load-dungeon.ts` all `.parse()`), so a schema-level default could stamp pages lazily. The migration is still right: it lets the schema **require** `pageId` forever instead of defaulting it forever, and keeps SQL-level reads and tooling complete. R1 audits for any blob read that bypasses the canonical loaders before flipping the schema to required.)
- **Canvas:** `MapCanvas` takes an **optional** `activePageId` (defaulting to the first page — the prop must be optional because the dungeon console's Edit board also mounts the canvas, and its page switcher should arrive deliberately, not leak in); React Flow never sees two coordinate spaces. `geometryToFlow` filters **both halves** — nodes to the active page *and* connections whose far endpoint is off-page (the transform currently emits every edge unconditionally, and floating edges null out when an endpoint node is absent; dangling edges are exactly what the chips replace). The "leads to ⇢" chips render **inside `ZoneNode`** — the console already occupies the `renderZoneOverlay` slot with occupancy chips. Editor: page tabs (+ new / rename / delete-empty / move-zone-to-page). Cross-page connections are authored via a **zone picker** (context menu → searchable, page-grouped — the ⌘K pattern), which doubles as a drag-free same-page connector (an a11y win in its own right). Drag-to-connect stays same-page only.
- **Watch:** lists only pages containing revealed zones; follows the page of the party's most recent move, manually overridable. Move recency has **no existing data source** (occupancy is an unordered record), so the instance gains one fact: `lastMovedTokenKey`, written by the move/place events and projected into the snapshot as the active-page hint (last-moved token wins for a split party).
- **Deliberate exclusions:** no per-page viewport memory, no reordering, no page colors — schema-stable to add later.

### D4 — State homes and the event vocabulary

Authored vs runtime, decided at the schema line:

- **`mapZoneSchema` gains exactly three authored fields:** `templateKey?` (the grammar binding), `portalMapId?`, and `rollContentsAtStart?` (the PRD's per-zone opt-in for content rolls on bound authored zones — default off; 2026-07-16, previously omitted). All set in the Map editor; generated zones get `templateKey`/`portalMapId` stamped at mint. None ever serializes to the player snapshot. Portal *entry* is authored on the target Map, not the portal zone: **`mapGeometrySchema` gains `entryZoneId?`** — the zone where grafting places the party ("the first zone" would be order-dependent); lint requires it on any Map a portal targets.
- **`MapInstanceState` gains a `generation` slice** (sibling of `occupancy`/`reveal`):

```ts
generation: {
  stubs: Record<string, {
    id: string; zoneId: string; bearing: number
    anchor: { side: "n" | "e" | "s" | "w"; offset: number }   // computed at sprout from the parent's footprint + bearing; the snapshot's exit shape (D10)
  }>,
  zones: Record<string, {                     // provenance — every zone
    source: "authored" | "generated" | "manual"   // manual = DM hand-added mid-run via editGeometry (stamped at that boundary); visit-scoped like generated — permanent space is authored on the seed Map. The distinction gates retract (generated only) and the reveal fold (authored only)
    templateKey?: string
    depth: number                             // authored: recomputed at expedition start
    manifest?: ContentManifest                // DM-only; includes staged wandering results
  }>,
  grafts: Record<string, { pageIds: string[] }>,   // keyed by source mapId — per-expedition graft idempotence + the zone→source-Map attribution the staticReveal fold reads (seed pages attribute to the seed Map)
}
```

- **`DungeonState` gains the draw ledger** (visit-lifetime, brother of the turn counter):

```ts
generation: {
  seed: string,
  streamCursors: Record<string, number>,      // per-purpose RNG positions, bumped by the events that consume rolls; NEVER rewound by revertMint
  declarations: Array<{
    id: string; sequence: number              // creation order — the due-collision priority (D6) and the mint-record referent
    templateKey: string; minDepth: number; k: number
    secretIndex: number                       // N ∈ 1..k, rolled at declaration
    qualifyingCount: number
    resolvedZoneId?: string
  }>,
  mintedUniqueKeys: string[],
  mints: Record<string, {                     // per-mint ledger effects, keyed by zoneId — the exact inverse revertMint replays; removed on retract (visit-lifetime, like everything here)
    sequence: number; templateKey: string
    effects: Array<{ declarationId: string; incremented: boolean; resolved: boolean }>
  }>,
}
```

- **Events.** The v2 `MapInstanceEvent` vocabulary gains a generation family, each carrying a fully resolved payload (D1): `mintZone { stubId, zone, connectionId, stubs, provenance, manifest? }` — where the minted connection takes **`id := stubId`** and retract restores the original stub id (exit-id continuity, D10) — `closeLoop { stubId, connectionId, toZoneId }`, `retractZone { zoneId, restoredStub }`, `resolveDeadEnd { stubId }` (the PRD's no-connector fallback, previously missing from the vocabulary: the stub is removed and the exit narrates as collapsed rubble; a response-lost retry finds the stub gone — the same benign no-op as a consumed stub), and `graftPages { mapId, pages, zones, connections, portalConnectionId }`. The `DungeonEvent` vocabulary gains the ledger family: `declareSite`, `recordMint`, `revertMint`, and `advanceCursors` — the stream-cursor bump **every** expansion outcome emits (all three outcomes consumed a roll). For a loop closure or a dead end, `advanceCursors` is the **only** dungeon-side effect: no `advanceTurn`, no `recordMint` — neither mints space, so by the cost predicate they cost no turn and touch no draw/uniqueness state. `recordMint` appends the ledger's per-mint record (`mints[zoneId]`: which declarations it incremented and which it resolved) alongside its `mintedUniqueKeys` and declaration updates. **`revertMint` replays the recorded inverse from `mints[zoneId]`** — releases the template's key, and per recorded effect decrements that declaration's `qualifyingCount` and clears its `resolvedZoneId`, re-arming the draw; the mint record is then removed. The record is what makes **non-LIFO retract sound**: the PRD allows retracting any unrevealed generated leaf, and declarations created after the mint — or resolved by later mints — must be untouched; without per-mint effects, "decrement every declaration the mint incremented" is unrecoverable from aggregate counts (2026-07-16). It **never rewinds `streamCursors`** — a re-expand after retract consumes fresh stream positions and rolls a *different* result; without the cursor rule, pure-function determinism would re-roll the identical zone and the escape hatch couldn't escape. The turn tick is **not** a new event — expansion composes the existing `advanceTurn` (correctly resetting `actedCharacterIds`: a new dungeon turn began) with the mint in one transaction.
- **The mint ledger law** (PRD) is enforced in one place: `rollExpansion` and its force-pick/force-place variants all emit `recordMint`, which appends `mintedUniqueKeys` and resolves any matching declaration — random roll, force-pick, and draw placement cannot diverge because they share the emitter. Expedition start is the law's fourth case (D5): bound authored `unique` templates seed `mintedUniqueKeys`, and a ticked site whose template is already present in authored geometry resolves immediately — the checklist shows it as already-on-the-map, and an authored Castle Entrance can never coexist with a rolled one.

### D5 — Region knowledge folds; expeditions own their instances (the load-bearing decision, re-decided 2026-07-16)

The 2026-07-08 session decided a persistent Region-owned MapInstance shared by every expedition. The implementation-readiness review killed it: **encounter and dungeon history are identified *through* the instance** on current main — `encounter` has `mapInstanceId` but no `dungeonId`; `endDungeonCombatAction` associates by instance-id equality; the dungeon watch resolves live encounters purely by instance id with no status gating; encounter snapshots re-read live instance state on every request. A shared mutable instance makes "frozen campaign history" false, and every repair (freeze-at-combat-end, historical clones, `dungeonId` columns, re-sync connection provenance) was machinery serving the shared instance rather than the product. Root-caused: the only facts that must outlive an expedition are *knowledge* — which sites the party knows, which rooms of each stable building they've mapped. The persistent instance is deleted from the design; the knowledge gets Region-sized homes:

- **An expedition is exactly today's dungeon shape** — its own row, its own MapInstance, snapshotted from the **live seed Map** at start (`startExpeditionAction` is `startDelveAction`-shaped). Map edits arrive next expedition automatically because every expedition re-snapshots the live source — no re-sync, no provenance-driven upserting. Mid-run edits, including hand-added zones and connections, are visit-scoped **by construction**, and the reshuffle keeps its promise. Frozen history is free: a done expedition's instance is never written again (D11 seals the boundaries). `dungeon.regionId` (**restrict**, not set-null) marks the variant; ordinary dungeons are untouched.
- **The Region owns two folds**, both written by `finishExpeditionAction` (new — today's finish is a bare `setDungeonStatusAction` flip; status → done + folds, one `guardMany` over dungeon + region **+ instance** — the instance guard is not a write but the freeze: an in-flight spatial write committing between the fold's read and finish's commit fails finish's instance version guard and forces a retry, while one arriving after finish fails its own guard and re-reads `done`; refuses under a live encounter):
  - **`discoveredSiteKeys`** — the templates of revealed site zones, **authored or generated alike** (no "always-known" carve-out: a hidden authored site the party never found stays undiscovered). Folding at finish rather than per-reveal is product-equivalent — the annotation only matters next expedition, and `unique` blocks same-expedition re-placement.
  - **`staticReveal: Record<sourceMapId, { zoneIds, connectionIds }>`** — explored state per source Map, covering the **seed Map and every grafted static Map uniformly**. Attribution is derived, not stored: a zone folds to the Map its page came from (`grafts` for grafted pages; the seed Map for the rest); generated and manual zones never fold. Re-applied at the two boundaries that materialize a source Map — expedition start (seed Map) and graft (static Map). Ids the author has since deleted filter on apply, graceful like every blob boundary. This is the PRD's original reveal-copy model with the copy homed on the object whose lifetime matches the fact.
- **Expedition start**, in order, one `guardMany` over (dungeon, instance): snapshot live seed Map → apply `staticReveal[seedMapId]` → compute authored depths (**multi-source** shortest path from the party's starting zones — placement is per-character today, so a split start is legal and "the entrance" is a set) → **seed the ledger from authored geometry**: bound authored `unique` templates enter `mintedUniqueKeys`, and ticked sites already present in authored space resolve immediately (the ledger law's delve-start case, D4) → roll draws for the remaining ticked sites → cull optional exits on bound authored zones (expedition-seed RNG, deterministic) and sprout stubs for the remaining exit budget (authored connections consume it first) → run content rolls where `rollContentsAtStart` is set → place roster → flip `active`. Refuses under a live encounter, and under D11's lifecycle serialization.
- **Graft** (P6) copies the target Map's pages/zones/connections **preserving source ids** (ids are `crypto.randomUUID()` — collision-free in practice; graft asserts no incoming id already exists in the instance and refuses rather than remaps), applies `staticReveal[mapId]`, stitches the portal connection, and places the party at the Map's `entryZoneId` (D4). Idempotent per Map **per expedition** via `grafts`. Ownership is checked server-side: the target Map must belong to the acting DM — `requireCampaignDM` alone does not authorize reading an arbitrary Map by id. A target Map deleted between expeditions → the portal refuses with a narrated dead-portal fallback (lint warns ahead of time; blob refs can't FK).
- **Regions archive; they don't hard-delete.** Once any expedition exists, `dungeon.regionId`'s **restrict** FK makes deletion impossible at the database, not merely by convention — the Campaign Planner's slot claims cascade on dungeon delete, so deleting a Region would silently rewrite frozen campaign history. `archivedAt` hides the Region from campaign surfaces; hard-delete exists only for the zero-expedition mistake case (now a single-row delete — there is no companion instance to orphan).

**What dissolved with the persistent instance:** the sweep, authored re-sync and the connection provenance it would have required, reveal-seeding-as-mechanism (now a one-line fold apply), per-Map-ever graft idempotence, `region.mapInstanceId` and its unique/cleanup semantics, and the entire encounter/dungeon history-identity repair. The megadungeon-place framing (Undermountain, space accreting forever) is the one real loss, accepted: a campaign wanting a permanently growing place authors a bigger seed Map — permanence lives where authoring lives. The recognized long-term remedy is the **Place model** ([ADR-0001](../adr/0001-knowledge-folds-now-places-later.md)) — `staticReveal` is a chart in escrow, and this feature's provenance recording is deliberately Places-ready.

### D6 — The algorithmic layer

All pure, all in `game-v2/generation/`, all consuming the RNG port.

- **Layout — directional fan, page-local, positions immutable.** Every stub stores an outward **bearing** inherited at mint: a zone's stubs fan across the arc facing away from its parent connection. Expansion places the new zone at `parent + bearing × spacing`, spacing = median authored-zone gap on the page (fallback constant). Collision checks use the shipped **rectangular footprints** (`size` S–XL, UNN-630 — not a center-radius approximation; existing authored L/XL zones make the difference real) and nudge along alternating perpendicular steps (±15°, ±30°, …), then extend the distance and repeat — deterministic, no force simulation, never moves an existing zone (the DM may have hand-adjusted; the reducer's no-op contract stays intact). Placement additionally keeps the minted zone in the half-plane of its stub's stored anchor side, so the derived exit anchor keeps its wall (D10).
- **Growth modes** (per page, authored in the Map editor; default `edge`): `edge` derives an **inward vector** (starting-zone centroid → centroid of the page's other authored zones; fallback screen-up), fans the entrance zones' stubs across the half-circle, and enforces a **hard half-plane guard** — no generated placement (or closure candidate) behind the boundary line. `open` (descended-into fiction) fans a full circle, no guard. With `edge`, depth roughly maps to a canvas axis — "deep in the city" is legible on the map.
- **Draw scheduling under collision** (2026-07-16; the PRD's collision-adjusted bound): when an expansion comes due for several declarations at once, exactly one resolves — force-placements (K=1) first, then ascending declaration `sequence` — and the rest stay due, taking subsequent qualifying expansions. Deterministic, so the property tests can assert the exact bound: K plus the number of earlier-priority declarations due on the same expansion.
- **Loop closure:** candidates within `R = 1.5 × spacing` of the projected position, same page, two-way `accepts`, not already connected to the parent, **not the parent's parent** (a triangle back to grandpa reads as a redundant corridor, not a shortcut). Fires at the set's closure probability; nearest candidate wins. Mints nothing → free, non-qualifying (the carve-vs-cross predicate). `closeLoop` stamps its connection into a generated-connections record — a closure between two *authored* zones has no generated endpoint, and future provenance consumers can't otherwise identify it (ADR-0001 rider).
- **RNG:** one seed per expedition (minted at start, stored in the ledger), consumed as **named streams** — `hash(seed, purpose)` for templates / contents / closure / draws — so an extra contents roll never shifts the template sequence. Implementation: a ~20-line pure `splitmix`-family generator in game-v2; the port is `() => number`, tests inject constants.
- **K presets:** "this session" = 6, "eventually" = 15; presets-only in v1 (retunable in one constants file — N is rolled from whatever K was current at declaration).
- **Honest caveat:** spacing multiplier, fan angles, and R are *feel* parameters with defensible starting values; they get one tuning pass against a real ~30-zone expedition during P3. They are constants, not schema.

### D7 — The dice boundary: wandering checks are DM-rolled

Generation randomness is app-owned (D1). An encounter *check* is a play event: the shipped `random-encounter` reminder keeps firing on its interval, but its action opens the **wandering-table panel** — the Region's table rendered with **d100 ranges derived from row weights** (weights stay the authored truth; ranges are a projection, shown identically in the set editor). The DM rolls a physical d100 and clicks the row it landed on — or any other row, or dismisses. **The click is the DM's declaration, never the app's verdict**; fudging is the interface, not a hidden affordance. The chosen row becomes a manifest entry on the party's current zone (DM picks the zone when split) with the same stage-combat affordance as any manifest. Zone-contents rolls at mint remain app-rolled — they're world-fabric ("what was always in this room"), not play events. Cadence keeps **one runtime home**: the shipped `reminderSettings.randomEncounters` on the dungeon row (its `intervalTurns` enum widened if the region's default needs it); `region.settings.wanderingIntervalTurns` is only the authored default, stamped onto each expedition at mint — the through-line's one-stored-fact rule applied to our own schema.

### D8 — Console UX seams

1. **Minting an expedition:** "New expedition" on the Region creates the dungeon row exactly like today's dungeon mint (its own blank instance) plus `regionId`, and lands in the existing `draft` prep screen, which gains the **site checklist** (pre-ticked per `appearByDefault`, discovery-annotated from `discoveredSiteKeys`, per-site min-depth/urgency editable from template defaults) beside the existing roster placement. Start button → `startExpeditionAction` (D5).
2. **Expand:** click the stub node (rendered DM-side as a dashed ghost); pending spinner during the round trip; the server-returned deterministic events replay through the shared client reducers on arrival — nothing about the roll is applied optimistically (D1). The retry contract: a committed-but-response-lost retry finds the stub consumed (minted, closed, or dead-ended) and must surface as a **benign no-op** (the result arrives via the ping), never an error toast. **Force-pick** and **retract** live on the stub/zone context menu — retract menu-only (no hot-path accident) and server-checked: zone `"generated"`-provenance, unrevealed, **leaf-only** (none of its stubs consumed — no dangling descendants), unoccupied, and unreferenced by any encounter (adopting the occupied-zone no-op the shipped `editGeometry.deleteZone` already models). Emits `retractZone` + `revertMint` (replaying the recorded mint effects, D4).
3. **Contents:** the manifest renders in the DM zone panel (never the snapshot) with **"Stage combat"** pre-filling the existing client staging dialog — `{enemyKey, zoneId, count}` is exactly the shape of `StartDungeonEncounterSchema`'s `enemies` rows; the DM supplies name/advantage/first-side in the dialog it prefills. Deliberately two gestures (open panel → stage → confirm): pre-combat is a natural pause, the dialog is where "actually only 2 ghouls attack" lives. (PRD success criterion 4 was amended 2026-07-16 to say this explicitly rather than leaving it as a reading.)
4. **Wandering:** per D7.
5. **Objective status:** the console shows each declaration as *"seeking — eligible past depth 3"* plus the count of pending draws (the over-declaring guard); never `secretIndex`.

### D9 — Surfaces and routing: the `/stage` library

- **`/stage`** is a route group with a shared side-nav: the user-owned, campaign-agnostic **authoring library**. v1 tenants: `/stage/maps` (moved; the old `/maps` route tree is removed as a hard cutover) and `/stage/sets`. No `/stage` dashboard — it redirects to `/stage/maps`; the slot stays open. List pages share the side-nav; full-bleed editors (map canvas, set editor) suppress it via route-group nesting. The boundary: `/stage` = what you own as an author; the campaign shell = what a campaign is running — the authored-vs-instantiated line, drawn in the nav.
- **The set editor** (`/stage/sets/[shortId]`): two-pane forms (templates | tables), whole-blob autosave, live **lint panel** (`lintTemplateSet(set)`, pure, game-v2): unmintable templates (no legal partner either direction), missing/non-universal **connector** designation (the empty-pool fallback's precondition, proven here), dangling table refs, unresolvable enemy/item keys, unresolvable `portalMapId`, sites missing declaration defaults. **Lint is advisory in the editor; expedition start refuses on errors** — the last calm moment to prevent the mid-session dead click.
- **Region surfaces** mount in the campaign shell (Planner dependency, see header): create (name + seed Map + Template Set — wandering-table designation checked here, and ownership of both authoring rows server-checked, §4), settings, discovered sites, expedition history, "New expedition" — plus a Region-stable **"current expedition" watch link**, so players aren't handed a fresh `/c/dungeon/[shortId]` URL every session.

### D10 — Snapshot, redaction, and realtime

`projectDungeonSnapshot` changes:

- Zones gain `pageId` — a deliberate new wire field, blessed by the release gate — plus the revealed-page list (name + id only) and the `lastMovedTokenKey` active-page hint (D3). (Corrected 2026-07-16: `DungeonSnapshotZone` **does** carry authored `position` and the Visual Overhaul identity fields on current main — the 2026-07-08 claim that the watch derives its own layout was stale. Pages ride alongside the existing fields; generated zones' minted positions serialize like authored ones, which is what makes auto-layout player-visible and D6's legibility requirement real.)
- **Stubs project as exits** — byte-shape-identical to an authored unexplored exit. Corrected 2026-07-16: the wire shape is `{ id, zoneId, locked, side, offset }` (post-UNN-633 rim thresholds), not the bare triple the 2026-07-08 draft assumed — and authored exit anchors are *derived from both endpoint footprints*, which a stub cannot do (it has no far zone; the shipped derivation would silently fall back to `{side:"n", offset:0.5}`). So the stub **stores its anchor** (`side`/`offset`, computed at sprout from the parent's footprint + the stub's bearing, D4) and projects it. Continuity contract across the lifecycle: the mint reuses the stub id as the connection id and layout places the minted zone in the stub's anchor half-plane so the two-rect derivation keeps the same **side** (the offset may settle); retract restores the original stub **with its stored anchor**, byte-identical to the pre-mint payload. A payload-diffing player sees exactly the id and doorway continuity authored space produces. Indistinguishability is structural, not cosmetic.
- **Never read, therefore never written:** `generation.zones` (provenance, manifests), `generation.stubs` internals, the ledger, `templateKey`, `portalMapId`, `dmNotes` (as today). The existing redaction release-gate test extends to assert all of it.
- Realtime: unchanged for the watch — the existing dungeon + instance pings cover every new write (expansion pings both rows via the dual-version return, like `searchReveal`). Inherited limitation, named: the DM-to-DM console channel is still unshipped (M3/UNN-468), so a second DM console doesn't see expansions live — same as every dungeon write today.

### D11 — Concurrency and lifecycle sealing (2026-07-16)

The review established that the shipped guards do not close the lifecycle races, and this feature raises the stakes on them. `guardMany` is optimistic version-check-and-rollback only — no locks, default isolation — and the shipped lifecycle actions perform their status/live-encounter reads well before their transactions (`startDungeonEncounterAction` reads ~65 lines ahead of `guardMany`; the one-active rule is an app-side `SELECT` with no database constraint; `setDungeonStatusAction`'s `active → done` and `applyDungeonEvent` check no status at all). Repairs, all landing with P2:

- **Database-enforced one-active invariant:** a partial unique index on `dungeon(campaignId) WHERE status = 'active' AND "deletedAt" IS NULL`. Two racing starts both pass the read; the second `UPDATE … SET status='active'` now fails at the database. The app-side read stays as the friendly error.
- **The dungeon row version is the lifecycle serialization point.** Every expedition lifecycle action — start, finish, combat start, combat end — includes a version-guarded write on the dungeon row inside its `guardMany`, and performs its status/live-encounter reads inside that transaction. Optimistic guards then make read-then-write safe without locks: two racing lifecycle actions conflict on the dungeon version, one gets `"stale"`, retries against fresh state, and the status check refuses. (Combat start/end today guard only instance + encounter rows; the expedition variants add the dungeon guard.)
- **Status guards at every write boundary.** `applyDungeonEvent` / `applySpatialEvent` and every generation action require `status = "active"` for spatial, generation, and ledger events — a done or draft expedition's rows are immutable through the event vocabulary, which is what makes "frozen history" (D5) true rather than assumed. The status read alone cannot close the race against finish (a reveal can read `active` before the fold and commit after it) — that is closed by finish's **instance version guard** (D5): the in-flight write and finish conflict on the instance row, whichever commits second retries, and the retry re-reads `done` and refuses.
- **Variant sealing.** The generic actions must reject Region expeditions, not merely be unrouted from them: `startDelveAction` and `setDungeonStatusAction` refuse `regionId`-bearing dungeons (directing to `startExpeditionAction` / `finishExpeditionAction`), decided once in a shared `loadDungeonVariantForWrite` helper rather than per-action. UI routing is not an invariant.
- **Client: cross-row gestures serialize against both lanes.** The console's two `useQueuedWrite` lanes are independent chains today, the instance lane has no stale-refetch (an unwired `fetchInstanceVersion` factory already exists), and `searchReveal` refetches only the dungeon token. Expansion/retract/graft enqueue on a combined spine — acquire the dungeon lane, and inside it await the instance lane — so a two-row write can never interleave with a single-row write on either lane; both tokens get refetch actions, and a cross-row stale retry refetches **both** versions. A second stale remains a real conflict surfaced to the DM, as today.

## 2. Schema

```sql
-- New: template sets (Map storage pattern)
CREATE TABLE "templateSet" (
  id text PRIMARY KEY, "shortId" text NOT NULL UNIQUE,
  "userId" text NOT NULL REFERENCES "user" ON DELETE cascade,
  name text NOT NULL,
  content jsonb NOT NULL,          -- TemplateSetContent
  version integer DEFAULT 0, "createdAt"/"updatedAt" timestamps
);

-- New: regions (the knowledge home, D5)
CREATE TABLE "region" (
  id text PRIMARY KEY, "shortId" text NOT NULL UNIQUE,
  "campaignId" text NOT NULL REFERENCES "campaign" ON DELETE cascade,
  name text NOT NULL,
  "seedMapId" text NOT NULL REFERENCES "map" ON DELETE restrict,
  "templateSetId" text NOT NULL REFERENCES "templateSet" ON DELETE restrict,
  settings jsonb NOT NULL,         -- { wanderingTableKey?, wanderingIntervalTurns? } — authored defaults; runtime truth stays on the dungeon row (D7). closureChance lives on the set (per-set knob, PRD)
  "discoveredSiteKeys" jsonb NOT NULL DEFAULT '[]',
  "staticReveal" jsonb NOT NULL DEFAULT '{}',   -- Record<sourceMapId, { zoneIds, connectionIds }> — the D5 fold
  "archivedAt" timestamp,          -- Regions archive, never hard-delete (D5)
  version integer DEFAULT 0, timestamps
);

-- Altered
ALTER TABLE dungeon ADD COLUMN "regionId" text REFERENCES region ON DELETE restrict;  -- restrict, not set-null: a Region with expeditions is undeletable at the DB (D5)
CREATE UNIQUE INDEX "dungeon_one_active_per_campaign"
  ON dungeon ("campaignId") WHERE status = 'active' AND "deletedAt" IS NULL;          -- D11
-- map.geometry / mapInstance.state: pages migration (D3) — one-time jsonb rewrite
```

Zod (game-v2 foundation additions, shapes abridged):

```ts
zoneTemplateSchema = {
  key, name, description, dmNotes,
  tags: string[], accepts: string[],
  exits: Array<{ optional: boolean }>,
  weight: number,                        // 0 = never random (site-by-choice profile)
  unique: boolean,
  portalMapId?: string,
  site?: { appearByDefault: boolean; defaultMinDepth: number; defaultUrgency: "session" | "eventually" },
  contentRolls: Array<{ chance: number; tableKey: string }>,
  tombstoned?: boolean,
}
contentTableSchema = { key, name, rows: Array<{ weight: number; entries: TableEntry[] }> }
// TableEntry = { kind:"enemy", enemyKey, count } | { kind:"item", itemKey }
//            | { kind:"currency", dice } | { kind:"text", text }
templateSetContentSchema = { templates: Record<key, ZoneTemplate>, tables: Record<key, ContentTable>, connectorTemplateKey?: string, closureChance: number }   // closure is the PRD's per-set knob — it lives here, not on region.settings
```

Plus D3's page fields and `entryZoneId?` on `mapGeometrySchema`, D4's three binding fields on `mapZoneSchema`, and D4's `generation` slices on `mapInstanceStateSchema` and `dungeonStateSchema`.

## 3. Pure layer — `packages/game-v2/src/generation/`

| Module | Job |
|---|---|
| `roll-expansion.ts` | The orchestrator (D1): socket legality (two-way accepts), candidate pool (weights, uniques, tombstones, withdrawn declarations), draw accounting (qualifying = zone-minting ∧ depth ≥ min; due declarations resolve one per expansion in D6's priority order), closure roll, empty-pool fallback (connector → dead end), contents rolls, layout call → events |
| `layout.ts` | Directional fan, spacing, collision nudge, growth modes, inward vector, half-plane guard (D6) |
| `closure.ts` | Candidate filter + pick (D6) |
| `rng.ts` | Seeded generator + named streams; the `() => number` port |
| `fold.ts` | `foldExpedition` — the finish-time knowledge folds: `discoveredSiteKeys` + `staticReveal` with page→source-Map attribution (D5) |
| `graft.ts` | `graftStaticMap` — pages copy preserving source ids (id-collision refusal), `staticReveal` apply, per-expedition idempotence via `grafts`, portal stitch, entry-zone placement |
| `lint.ts` | `lintTemplateSet` (D9) + `d100Ranges(table)` projection (D7) |
| `declarations.ts` | Declare/resolve/revert helpers over the ledger (mint records, due-collision scheduling); site-checklist derivation (set × discoveredSiteKeys) |

Reducer additions stay in `spatial/`: the five instance event kinds + four dungeon ledger kinds (exhaustive switches extend; new kinds fail compilation until handled).

## 4. Write map (Server Actions)

All follow the house pattern (parse → gate → pure → guarded commit → revalidate/ping). Gates: `requireCampaignDM` for everything region/expedition; `/stage` entities gate on `userId` ownership like Maps.

| Action | Rows (guard) | Notes |
|---|---|---|
| `template-set/create·rename·save-content·delete` | templateSet (version) | Map-editor save architecture; delete blocked by region FK |
| `region/create` | region (insert) | No instance minted — expeditions own theirs (D5). Server-checks that the actor **owns** `seedMapId` and `templateSetId` — `requireCampaignDM` proves the campaign, not the authoring rows; without the check a DM could bind another user's private Map/Set by id (the same rule D5 applies to graft targets) |
| `region/update-settings·archive` | region (version) | Archive once any expedition exists (DB-enforced via the restrict FK, D5); hard-delete only for the zero-expedition case |
| `dungeon/start-expedition` | dungeon + instance (`guardMany`) | One-active guard (DB index, D11) → snapshot live seed Map → apply `staticReveal` → depths (multi-source) → ledger seeding from authored geometry → draws → optional-exit culling + stubs + start-content rolls → roster → `active` (D5); refuses under a live encounter; checks inside the transaction (D11) |
| `dungeon/expand-stub` | dungeon + instance (`guardMany`) | `rollExpansion`, then outcome-split per the cost predicate — **mint**: `advanceTurn` + `recordMint` + `advanceCursors` + `mintZone`; **loop closure**: `advanceCursors` + `closeLoop`; **dead end**: `advanceCursors` + `resolveDeadEnd` (both free, non-qualifying). Returns both versions + events; the non-optimistic gesture (D1) |
| `dungeon/force-pick·force-place·declare-site` | dungeon (+ instance when minting) | Force-place = K=1 declaration (preempts on collision, D6); same emitters, same ledger law |
| `dungeon/retract-zone` | dungeon + instance (`guardMany`) | `retractZone` + `revertMint` (replays recorded mint effects); server-checked: generated-provenance, unrevealed, leaf-only, unoccupied, no encounter (D8) |
| `dungeon/graft-portal` | dungeon + instance (`guardMany`) | `graftStaticMap`; per-expedition idempotence via `grafts`; applies `staticReveal[mapId]`; target-Map ownership checked (D5); no turn cost (crossing, not carving); dungeon guard for lifecycle serialization (D11) |
| `dungeon/stage-wandering-result` | instance (version) | Appends the chosen row as a manifest entry on the party's zone (D7) |
| `dungeon/finish-expedition` (new) | dungeon + region + instance (`guardMany`) | Not an extension — today's finish is a bare `setDungeonStatusAction` flip. Status → done + both folds (`discoveredSiteKeys`, `staticReveal`); refuses under a live encounter; the instance guard freezes history against in-flight spatial writes (D5/D11) |
| `dungeon/start-delve·set-status·events` (existing) | — | Sealed per D11: refuse `regionId`-bearing dungeons on the generic paths; spatial/generation/ledger event writes require `active` |

Client: expansion/retract/graft join the console via the two-token `useQueuedWrite` pair **on D11's combined spine** (cross-row gestures acquire the dungeon lane and await the instance lane inside it; both tokens gain refetch actions), folding both returned versions (`bump()`); the server-returned deterministic events replay through the shared client reducers on arrival — nothing about a roll is applied optimistically (D1). Stage-from-manifest is client-side prefill of the existing staging dialog — no new write.

## 5. Riders (standalone, land-anytime)

- **R1 — Pages substrate** (D3): schema + one-time migration (with the loader-bypass audit, D3), editor page tabs + zone picker, canvas optional `activePageId` + two-halves edge filtering, cross-page chips (in `ZoneNode`), snapshot/watch page support incl. `lastMovedTokenKey` — **plus the page-blind shipped surfaces**: the combat canvas, the staging dialog's zone picker, prep roster placement, the wandering zone picker, and the e2e factory geometry all enumerate zones flat today and need page grouping/labels. Any collision-aware behavior R1 touches uses the shipped rectangular footprints (`size` S–XL), not center-radius. Independent value: multi-floor static dungeons.
- **R2 — `/stage` shell** (D9): route group, side-nav, `/stage/maps` hard cutover with no legacy `/maps` route, empty Sets slot. Sequenced **before** R1's editor-UI half — both touch the Map route-tree files (`map-editor.tsx`, page components); the shared canvas kit in `components/shared/canvas` is unaffected, so R1's schema/domain half is parallel-safe.

## 6. Build order

Re-sequenced 2026-07-16 — the prior order had a P1↔P2 "may swap" that the Region's `templateSetId NOT NULL` FK forbids, assigned the ledger to P4 while P3's expand loop emits ledger events, and called R1/R2 parallel-safe where they share route-tree files:

**R2** (`/stage` move first — smallest, unblocks the editor work) → **R1** (pages substrate; the schema/domain half may run parallel to R2, the editor-UI half follows it) → **P1a — Template Set contracts + storage** (table, schemas incl. `closureChance`, CRUD, ownership; the Region FK's hard dependency) → **P2 — Region & expedition lifecycle** (region table + folds, `startExpeditionAction` / `finishExpeditionAction`, **all of D11**: partial unique index, dungeon-row lifecycle serialization, status guards, variant sealing, combined client spine — proven with a hand-authored expedition with zero procgen; de-risks D5 and the concurrency contract in isolation) → **P1b — Set editor + lint** (may run parallel to P2 once P1a and R1 stabilize the shared schemas) → **P3 — Generation foundation + expand loop** (RNG + cursors, **the ledger base**: `mintedUniqueKeys`, mint records, `recordMint`/`revertMint`, authored-geometry seeding; stubs + stored anchors, mint/closure/retract/dead-end, layout + the tuning pass, snapshot silhouettes) → **P4 — Objectives & discovery** (declarations + due-collision scheduling, force-place, checklist UI, `discoveredSiteKeys` fold, objective status) → **P5 — Contents & wandering** (manifests, zone panel, stage prefill, wandering panel) → **P6 — Portals** (`entryZoneId`, graft + `staticReveal` apply, ownership check, follow behavior, watch page-following).

P2 → P3 → P4 stay serial — all three touch the hot schemas, reducer unions, start/finish actions, console, and snapshot projection. P5/P6 parallelize only after their schema additions land separately; as described they'd otherwise overlap in `MapInstanceState`, generation actions, and the zone panel. Each phase ends table-usable. The 2026-07-08 prerequisites are resolved: this revision *is* the rebase against current main (`f1599f3d`), and the instance-lane stale-retry is absorbed into D11 (P2), well before P3's expand gesture needs it.

## 7. Test spine

- **Property tests** (pure engine, seeded RNG): the **collision-adjusted K-guarantee** (∀ seeds, exploration paths, declaration interleavings, **and retract sequences**: each declaration resolves within K qualifying expansions plus one per earlier-priority declaration due on the same expansion — exactly K when collisions are zero; retract-then-re-expand must re-arm the draw and, via the stream cursors, roll a *different* result); every random mint passes two-way accepts; layout invariants (no footprint overlap, half-plane respected under `edge`, minted zone stays in its stub's anchor half-plane); **fold round-trips** (reveal earned on authored/grafted zones in expedition N is present after N+1's start/graft; generated and manual space is absent from N+1 by construction; stale source ids filter without error); per-expedition graft idempotence + id-collision refusal; ledger law (any mint path — including expedition-start authored seeding — consumes uniqueness + resolves declarations; `revertMint` restores the exact pre-mint ledger minus cursors, **under arbitrary non-LIFO retract orders**, which is what the mint records exist to make true).
- **Redaction release-gate extension** (D10): stub ≡ authored exit in **full payload shape** (`id`, `zoneId`, `locked`, `side`, `offset`) — id and anchor continuity across expand→reveal, side continuity across mint, byte-identical stub restoration across expand→retract; provenance/manifests/ledger/mint records/templateKey/portalMapId never serialize.
- **Lint unit tests** per rule; `d100Ranges` normalizes by largest-remainder with a minimum width of 1 per row (no unhittable rows) and preserves weight order.
- **One e2e expedition-loop spec** via the factory (`createRegionTarget`): mint region → start expedition → expand → declared site appears → stage from manifest → finish → second expedition differs, castle reveal persists.

## 8. Deliberately deferred (unchanged from PRD unless noted)

Per-exit `accepts`; loop-closure probability UI beyond the per-set knob; `/stage` dashboard; quest structure (AND/OR graph — Planner territory if ever); player-facing objective tracker; multi-Region-per-campaign UX polish; rules-vault canonization of the two shipped procedures (turn cost, wandering).
