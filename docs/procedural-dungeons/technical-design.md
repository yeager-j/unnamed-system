# Procedural Dungeons — Technical Design

> **Canonical source.** Companion to the [PRD](./PRD.md); this document absorbs the ADR role the PRD's early drafts referenced. Product behavior lives in the PRD; this is how it's realized. Designed 2026-07-07/08.

**Status:** Accepted (design session 2026-07-07/08; validated 2026-07-08 — an architecture fact-check against post-UNN-540 main plus an adversarial review, 27 findings folded in) · **Owner:** Jackson

**Prerequisites & dependencies:**

- **Exploration on game-v2 — done.** UNN-540 (PR #299) shipped the exploration cutover; the v1 spatial engine is deleted. Everything below targets `packages/game-v2` (`spatial/` + a new `generation/` domain).
- **Campaign Planner shell — lands first.** Region surfaces mount inside the overhauled campaign shell (expected `/campaigns/[id]/regions`, alongside `/campaigns/[id]/dungeons`); this design does not commit campaign-side routes. Cross-expedition *time* (days, factions) stays the Planner's; the two features share only the Campaign container.

## 0. The through-line: one lifetime per fact

The PRD's design sessions kept converging on "derive, don't store" / "decide a distinction once." This document's version: **every fact lives exactly one lifetime, on the object with that lifetime.**

- **Authored** facts (template definitions, seed geometry, zone↔template bindings, growth modes) live on user-owned rows (`map`, `templateSet`) and are *referenced*, never copied-and-mutated.
- **Place** facts (what permanently exists: authored pages, grafted static pages, their reveal state, discovered sites) live on the **Region** and its **persistent MapInstance** — campaign-lifetime (D5, the load-bearing decision).
- **Visit** facts (turn counter, draw ledger, occupancy, generated zones, stubs, manifests) live on the **expedition** (dungeon row) and the instance's generation slice, and are swept when the visit ends.
- **Derived** facts are never stored: cross-page-ness (from endpoints), d100 ranges (from weights), the inward growth vector (from the seed skeleton), stub silhouettes in the snapshot (from stubs), site-checklist annotations (from `discoveredSiteKeys`).

Two predicates decided once and consumed everywhere:

- **Mints-new-space?** → costs a Dungeon Turn, counts as a qualifying expansion (PRD's carve-vs-cross).
- **Authored-or-generated?** (per-zone provenance) → survives the sweep or dies with the visit.

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
- **`region`** is a real table (campaign-scoped, referenced by dungeon rows): FKs `campaignId` (cascade), `seedMapId` (restrict), `templateSetId` (restrict), `mapInstanceId` (restrict — the persistent place, D5). The restrict FKs make tombstoning concrete: a Map or Set a Region depends on cannot be hard-deleted.
- **Template-level tombstone** is a flag inside the set blob: a tombstoned template stops appearing in random rolls and the site checklist but keeps resolving existing references (bindings, provenance, discovered sites). The editor offers tombstone where delete would dangle; lint reports danglers.

### D3 — Pages: derived cross-pageness, one-time migration, page-scoped canvas

- `geometry.pages: Record<pageId, { id, name, growth?: "edge" | "open" }>`; every zone gains a required `pageId`. Connections gain **nothing** — a connection is cross-page iff its endpoints' zones are on different pages, derived at render (a stored `crossPage` flag would be a second decider). Cross-page connections render as "leads to ⇢" chips on both zone nodes; clicking a chip navigates to the far page and focuses the linked zone — the same affordance the console and watch use to *follow* a portal.
- **Migration:** one-time SQL migration stamps a default page into every existing `map.geometry` and `mapInstance.state.geometry` blob; the schema then *requires* `pageId`. (Lazy parse-time normalization was declined: DB reads don't zod-parse — `$type<>` is compile-time trust — so lazy means normalize calls at every load boundary forever.)
- **Canvas:** `MapCanvas` takes an **optional** `activePageId` (defaulting to the first page — the prop must be optional because the dungeon console's Edit board also mounts the canvas, and its page switcher should arrive deliberately, not leak in); React Flow never sees two coordinate spaces. `geometryToFlow` filters **both halves** — nodes to the active page *and* connections whose far endpoint is off-page (the transform currently emits every edge unconditionally, and floating edges null out when an endpoint node is absent; dangling edges are exactly what the chips replace). The "leads to ⇢" chips render **inside `ZoneNode`** — the console already occupies the `renderZoneOverlay` slot with occupancy chips. Editor: page tabs (+ new / rename / delete-empty / move-zone-to-page). Cross-page connections are authored via a **zone picker** (context menu → searchable, page-grouped — the ⌘K pattern), which doubles as a drag-free same-page connector (an a11y win in its own right). Drag-to-connect stays same-page only.
- **Watch:** lists only pages containing revealed zones; follows the page of the party's most recent move, manually overridable. Move recency has **no existing data source** (occupancy is an unordered record), so the instance gains one fact: `lastMovedTokenKey`, written by the move/place events and projected into the snapshot as the active-page hint (last-moved token wins for a split party).
- **Deliberate exclusions:** no per-page viewport memory, no reordering, no page colors — schema-stable to add later.

### D4 — State homes and the event vocabulary

Authored vs runtime, decided at the schema line:

- **`mapZoneSchema` gains exactly two authored fields:** `templateKey?` (the grammar binding) and `portalMapId?`. Both set in the Map editor; generated zones get them stamped at mint. Neither ever serializes to the player snapshot.
- **`MapInstanceState` gains a `generation` slice** (sibling of `occupancy`/`reveal`):

```ts
generation: {
  stubs: Record<string, { id: string; zoneId: string; bearing: number }>,
  zones: Record<string, {                     // provenance — every zone
    source: "authored" | "generated" | "manual"   // manual = DM hand-added mid-run via editGeometry (stamped at that boundary): survives sweep, exempt from re-sync
    templateKey?: string
    depth: number                             // authored: recomputed at expedition start
    manifest?: ContentManifest                // DM-only; includes staged wandering results
  }>,
  grafts: Record<string, { pageIds: string[] }>,   // keyed by source mapId — graft idempotence
}
```

- **`DungeonState` gains the draw ledger** (visit-lifetime, brother of the turn counter):

```ts
generation: {
  seed: string,
  streamCursors: Record<string, number>,      // per-purpose RNG positions, bumped by the events that consume rolls; NEVER rewound by revertMint
  declarations: Array<{
    templateKey: string; minDepth: number; k: number
    secretIndex: number                       // N ∈ 1..k, rolled at declaration
    qualifyingCount: number
    resolvedZoneId?: string
  }>,
  mintedUniqueKeys: string[],
}
```

- **Events.** The v2 `MapInstanceEvent` vocabulary gains a generation family, each carrying a fully resolved payload (D1): `mintZone { stubId, zone, connectionId, stubs, provenance, manifest? }` — where the minted connection takes **`id := stubId`** and retract restores the original stub id (exit-id continuity, D10) — `closeLoop { stubId, connectionId, toZoneId }`, `retractZone { zoneId, restoredStub }`, `graftPages { mapId, pages, zones, connections, portalConnectionId }`. The `DungeonEvent` vocabulary gains the ledger family: `declareSite`, `recordMint`, `revertMint`, and `advanceCursors` — the stream-cursor bump **every** expansion outcome emits (both outcomes consumed a roll). For a loop closure, `advanceCursors` is the **only** dungeon-side effect: no `advanceTurn`, no `recordMint` — closures mint no space, so by the cost predicate they cost no turn and touch no draw/uniqueness state. **`revertMint` is fully specified, because a retract must not kill the K-guarantee:** it releases the template's key from `mintedUniqueKeys`, clears `resolvedZoneId` on any declaration the mint resolved, and decrements `qualifyingCount` on every declaration the mint incremented — so the next qualifying expansion becomes the new Nth and the draw re-arms. It **never rewinds `streamCursors`** — a re-expand after retract consumes fresh stream positions and rolls a *different* result; without the cursor rule, pure-function determinism would re-roll the identical zone and the escape hatch couldn't escape. The turn tick is **not** a new event — expansion composes the existing `advanceTurn` (correctly resetting `actedCharacterIds`: a new dungeon turn began) with the mint in one transaction.
- **The mint ledger law** (PRD) is enforced in one place: `rollExpansion` and its force-pick/force-place variants all emit `recordMint`, which appends `mintedUniqueKeys` and resolves any matching declaration — random roll, force-pick, and draw placement cannot diverge because they share the emitter.

### D5 — The persistent place (the load-bearing decision)

The prior model conflated **place-state** with **visit-state** — harmless for one-shot dungeons where the lifetimes coincide, wrong for a megadungeon campaign (Drakkenheim, Undermountain) where the place outlives every visit. Reveal-seeding, per-expedition graft idempotence, and a growing pile of Region "folds" were all visit-scoped storage smuggling place-state across visits. Fixed structurally:

- **The Region owns one persistent MapInstance** (`region.mapInstanceId`, restrict) — created at Region creation from the seed Map, alive for the campaign. It holds the seed pages, every grafted static page, and **all reveal state, permanently**.
- **An expedition is an ordinary dungeon row** (`draft → active → done`, turn counter, ledger — unchanged machinery) that **references the Region's instance** instead of minting its own. `dungeon.regionId` (nullable, set null) marks the variant; ordinary dungeons keep today's snapshot-per-run path. Two acquisition paths, decided once at mint.
- **Expedition start** (`startExpeditionAction`, the region-variant of `startDelveAction`, routed through the same one-active-delve-per-campaign guard): sweep (below) → **authored re-sync** → recompute authored depths from the entrance → roll draws for ticked sites → place roster → flip `active`. One `guardMany` over (dungeon, instance). **Re-sync is a per-zone/connection upsert-by-id, never a wholesale re-snapshot** (the Map editor stays meaningful for a place run across years; graft preserves source zone ids, which this depends on): geometry present in a source Map is upserted with reveal preserved by id; **instance-only geometry is preserved** — portal *stitch* connections (they exist in no source Map) and `"manual"`-provenance zones; zones a source Map deleted are dropped with reveal/connection/stitch cleanup; a source Map that was itself deleted → its pages keep their last snapshot.
- **The sweep — a per-field table, run once at expedition start** (idempotent; between expeditions the place rests with the last run's DM-side residue, which nothing projects). `sweepExpedition(instanceState)` is pure:

  | Field | Sweep behavior |
  |---|---|
  | `"generated"` zones + their connections | Die, with their reveal entries |
  | `"authored"` / `"manual"` zones | Persist with geometry *and* reveal; their `manifest`s clear (visit-data on place-entries — no eternal entrance ghouls) |
  | `generation.stubs` | Die; re-sprouted from bindings after re-sync |
  | `generation.grafts` | **Survive** — place-lifetime (graft idempotence is per-Map-ever) |
  | `occupancy`, `enchantment` | Clear |
  | Depths | Recomputed from the entrance after re-sync |

  Both `finishExpeditionAction` and `startExpeditionAction` **refuse while a live encounter references the instance** (the existing encounter-lock query) — sweeping under a running combat is the one corruption path, closed at the boundary. The Haze reshuffles what it built; it cannot unbuild the castle.
- **What dissolves:** reveal-seeding (the castle's fog never resets because its pages are never destroyed); graft idempotence simplifies to per-Map-ever (the `grafts` record); Region folds shrink to **one** — `discoveredSiteKeys`, justified because its referents (generated zones) are genuinely destroyed. The fold happens at expedition finish (scan revealed `"generated"` site zones' provenance — while they still exist; the sweep runs at the *next* start), not per-reveal — one write at a natural boundary. There is no shipped "finishDelve" action to extend — finish today is a bare `setDungeonStatusAction` flip — so the region variant is a **new** `finishExpeditionAction` (status → done + the fold, one `guardMany` over dungeon + region). Authored-bound site zones never enter the fold: **authored sites count as always-known** (they're in the seed Map by definition) and the checklist annotates them as such. *Implementation timing supersede of the PRD's "appended on first reveal": product-equivalent, since the annotation only matters next expedition and `unique` blocks same-expedition re-placement.*
- **Regions archive; they don't hard-delete.** Once any expedition exists, deletion would have to destroy every expedition and every encounter ever fought on the instance (both restrict-FK it) — and the Campaign Planner's slot claims cascade on dungeon delete, so deleting a Region would silently rewrite frozen campaign history. An `archivedAt` flag hides the Region from campaign surfaces; hard-delete exists only for the zero-expedition mistake case (region + instance in one transaction — `dungeon.regionId`'s set-null must never fire alone, or the persistent instance orphans).

### D6 — The algorithmic layer

All pure, all in `game-v2/generation/`, all consuming the RNG port.

- **Layout — directional fan, page-local, positions immutable.** Every stub stores an outward **bearing** inherited at mint: a zone's stubs fan across the arc facing away from its parent connection. Expansion places the new zone at `parent + bearing × spacing`, spacing = median authored-zone gap on the page (fallback constant). Collision (radius check against existing positions) nudges along alternating perpendicular steps (±15°, ±30°, …), then extends the radius and repeats — deterministic, no force simulation, never moves an existing zone (the DM may have hand-adjusted; the reducer's no-op contract stays intact).
- **Growth modes** (per page, authored in the Map editor; default `edge`): `edge` derives an **inward vector** (entrance → centroid of the page's other authored zones; fallback screen-up), fans the entrance's stubs across the half-circle around it, and enforces a **hard half-plane guard** — no generated placement (or closure candidate) behind the entrance's boundary line. `open` (descended-into fiction) fans a full circle, no guard. With `edge`, depth roughly maps to a canvas axis — "deep in the city" is legible on the map.
- **Loop closure:** candidates within `R = 1.5 × spacing` of the projected position, same page, two-way `accepts`, not already connected to the parent, **not the parent's parent** (a triangle back to grandpa reads as a redundant corridor, not a shortcut). Fires at the set's closure probability; nearest candidate wins. Mints nothing → free, non-qualifying (the carve-vs-cross predicate).
- **RNG:** one seed per expedition (minted at start, stored in the ledger), consumed as **named streams** — `hash(seed, purpose)` for templates / contents / closure / draws — so an extra contents roll never shifts the template sequence. Implementation: a ~20-line pure `splitmix`-family generator in game-v2; the port is `() => number`, tests inject constants.
- **K presets:** "this session" = 6, "eventually" = 15; presets-only in v1 (retunable in one constants file — N is rolled from whatever K was current at declaration).
- **Honest caveat:** spacing multiplier, fan angles, and R are *feel* parameters with defensible starting values; they get one tuning pass against a real ~30-zone expedition during P3. They are constants, not schema.

### D7 — The dice boundary: wandering checks are DM-rolled

Generation randomness is app-owned (D1). An encounter *check* is a play event: the shipped `random-encounter` reminder keeps firing on its interval, but its action opens the **wandering-table panel** — the Region's table rendered with **d100 ranges derived from row weights** (weights stay the authored truth; ranges are a projection, shown identically in the set editor). The DM rolls a physical d100 and clicks the row it landed on — or any other row, or dismisses. **The click is the DM's declaration, never the app's verdict**; fudging is the interface, not a hidden affordance. The chosen row becomes a manifest entry on the party's current zone (DM picks the zone when split) with the same stage-combat affordance as any manifest. Zone-contents rolls at mint remain app-rolled — they're world-fabric ("what was always in this room"), not play events. Cadence keeps **one runtime home**: the shipped `reminderSettings.randomEncounters` on the dungeon row (its `intervalTurns` enum widened if the region's default needs it); `region.settings.wanderingIntervalTurns` is only the authored default, stamped onto each expedition at mint — the through-line's one-stored-fact rule applied to our own schema.

### D8 — Console UX seams

1. **Minting an expedition:** "New expedition" on the Region creates the dungeon row against the persistent instance and lands in the existing `draft` prep screen, which gains the **site checklist** (pre-ticked per `appearByDefault`, discovery-annotated from `discoveredSiteKeys`, per-site min-depth/urgency editable from template defaults) beside the existing roster placement. Start button → `startExpeditionAction` (D5).
2. **Expand:** click the stub node (rendered DM-side as a dashed ghost); pending spinner during the round trip; the server-returned deterministic events replay through the shared client reducers on arrival — nothing about the roll is applied optimistically (D1). The retry contract: a committed-but-response-lost retry finds the stub consumed and must surface as a **benign no-op** (the zone arrives via the ping), never an error toast. **Force-pick** and **retract** live on the stub/zone context menu — retract menu-only (no hot-path accident) and server-checked: zone unrevealed, **leaf-only** (none of its stubs consumed — no dangling descendants), unoccupied, and unreferenced by any encounter (adopting the occupied-zone no-op the shipped `editGeometry.deleteZone` already models). Emits `retractZone` + `revertMint`.
3. **Contents:** the manifest renders in the DM zone panel (never the snapshot) with **"Stage combat"** pre-filling the existing client staging dialog — `{enemyKey, zoneId, count}` is exactly the shape of `StartDungeonEncounterSchema`'s `enemies` rows; the DM supplies name/advantage/first-side in the dialog it prefills. Deliberately two gestures (open panel → stage → confirm): pre-combat is a natural pause, the dialog is where "actually only 2 ghouls attack" lives, and the PRD's one-gesture criterion reads "no ceremony," not "no confirm."
4. **Wandering:** per D7.
5. **Objective status:** the console shows each declaration as *"seeking — eligible past depth 3"* plus the count of pending draws (the over-declaring guard); never `secretIndex`.

### D9 — Surfaces and routing: the `/stage` library

- **`/stage`** is a route group with a shared side-nav: the user-owned, campaign-agnostic **authoring library**. v1 tenants: `/stage/maps` (moved; old `/maps` routes 301) and `/stage/sets`. No `/stage` dashboard — it redirects to `/stage/maps`; the slot stays open. List pages share the side-nav; full-bleed editors (map canvas, set editor) suppress it via route-group nesting. The boundary: `/stage` = what you own as an author; the campaign shell = what a campaign is running — the authored-vs-instantiated line, drawn in the nav.
- **The set editor** (`/stage/sets/[shortId]`): two-pane forms (templates | tables), whole-blob autosave, live **lint panel** (`lintTemplateSet(set)`, pure, game-v2): unmintable templates (no legal partner either direction), missing/non-universal **connector** designation (the empty-pool fallback's precondition, proven here), dangling table refs, unresolvable enemy/item keys, unresolvable `portalMapId`, sites missing declaration defaults. **Lint is advisory in the editor; expedition start refuses on errors** — the last calm moment to prevent the mid-session dead click.
- **Region surfaces** mount in the campaign shell (Planner dependency, see header): create (name + seed Map + Template Set — wandering-table designation checked here), settings, discovered sites, expedition history, "New expedition" — plus a Region-stable **"current expedition" watch link**, so players aren't handed a fresh `/c/dungeon/[shortId]` URL every session.

### D10 — Snapshot, redaction, and realtime

`projectDungeonSnapshot` changes:

- Zones gain `pageId` — a deliberate new wire field, blessed by the release gate (snapshot zones carry no authored `position` today; the watch derives its own layout, so pages ride as grouping only) — plus the revealed-page list (name + id only) and the `lastMovedTokenKey` active-page hint (D3).
- **Stubs project as exits** — byte-shape-identical to an authored unexplored exit (`{ id: stubId, zoneId, locked: false }`), **including across the exit→connection transition**: the mint reuses the stub id as the connection id, and retract restores the original stub id, so a payload-diffing player sees exactly the id continuity authored space produces. Indistinguishability is structural, not cosmetic.
- **Never read, therefore never written:** `generation.zones` (provenance, manifests), `generation.stubs` internals, the ledger, `templateKey`, `portalMapId`, `dmNotes` (as today). The existing redaction release-gate test extends to assert all of it.
- Realtime: unchanged for the watch — the existing dungeon + instance pings cover every new write (expansion pings both rows via the dual-version return, like `searchReveal`). Inherited limitation, named: the DM-to-DM console channel is still unshipped (M3/UNN-468), so a second DM console doesn't see expansions live — same as every dungeon write today.

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

-- New: regions (the persistent place)
CREATE TABLE "region" (
  id text PRIMARY KEY, "shortId" text NOT NULL UNIQUE,
  "campaignId" text NOT NULL REFERENCES "campaign" ON DELETE cascade,
  name text NOT NULL,
  "seedMapId" text NOT NULL REFERENCES "map" ON DELETE restrict,
  "templateSetId" text NOT NULL REFERENCES "templateSet" ON DELETE restrict,
  "mapInstanceId" text NOT NULL REFERENCES "mapInstance" ON DELETE restrict,
  settings jsonb NOT NULL,         -- { wanderingTableKey?, wanderingIntervalTurns?, closureChance? } — authored defaults; runtime truth stays on the dungeon row (D7)
  "discoveredSiteKeys" jsonb NOT NULL DEFAULT '[]',
  "archivedAt" timestamp,          -- Regions archive, never hard-delete (D5)
  version integer DEFAULT 0, timestamps
);

-- Altered
ALTER TABLE dungeon ADD COLUMN "regionId" text REFERENCES region ON DELETE set null;
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
templateSetContentSchema = { templates: Record<key, ZoneTemplate>, tables: Record<key, ContentTable>, connectorTemplateKey?: string }
```

Plus D3's page fields on `mapGeometrySchema`/`mapZoneSchema`, D4's `generation` slices on `mapInstanceStateSchema` and `dungeonStateSchema`.

## 3. Pure layer — `packages/game-v2/src/generation/`

| Module | Job |
|---|---|
| `roll-expansion.ts` | The orchestrator (D1): socket legality (two-way accepts), candidate pool (weights, uniques, tombstones, withdrawn declarations), draw accounting (qualifying = zone-minting ∧ depth ≥ min; `secretIndex` hit → declared template, adjacency overridden), closure roll, contents rolls, layout call → events |
| `layout.ts` | Directional fan, spacing, collision nudge, growth modes, inward vector, half-plane guard (D6) |
| `closure.ts` | Candidate filter + pick (D6) |
| `rng.ts` | Seeded generator + named streams; the `() => number` port |
| `sweep.ts` | `sweepExpedition` — the provenance predicate (D5) |
| `graft.ts` | `graftStaticMap` — pages copy preserving zone ids, idempotence via `grafts`, portal stitch |
| `lint.ts` | `lintTemplateSet` (D9) + `d100Ranges(table)` projection (D7) |
| `declarations.ts` | Declare/resolve/revert helpers over the ledger; site-checklist derivation (set × discoveredSiteKeys) |

Reducer additions stay in `spatial/`: the four instance event kinds + three dungeon ledger kinds (exhaustive switches extend; new kinds fail compilation until handled).

## 4. Write map (Server Actions)

All follow the house pattern (parse → gate → pure → guarded commit → revalidate/ping). Gates: `requireCampaignDM` for everything region/expedition; `/stage` entities gate on `userId` ownership like Maps.

| Action | Rows (guard) | Notes |
|---|---|---|
| `template-set/create·rename·save-content·delete` | templateSet (version) | Map-editor save architecture; delete blocked by region FK |
| `region/create` | region + mapInstance (tx) | Mints persistent instance from seed Map (provenance-initialized) |
| `region/update-settings·archive` | region (version) | Archive once any expedition exists (D5); hard-delete only for the zero-expedition case (region + instance, one tx) |
| `dungeon/start-expedition` | dungeon + instance (`guardMany`) | One-active-delve guard → sweep → re-sync (upsert-by-id) → depths → draws → roster → `active` (D5); refuses under a live encounter |
| `dungeon/expand-stub` | dungeon + instance (`guardMany`) | `rollExpansion`, then outcome-split per the cost predicate — **mint**: `advanceTurn` + `recordMint` + `advanceCursors` + `mintZone`; **loop closure**: `advanceCursors` + `closeLoop` only (free, non-qualifying). Returns both versions + events; the non-optimistic gesture (D1) |
| `dungeon/force-pick·force-place·declare-site` | dungeon (+ instance when minting) | Force-place = K=1 declaration; same emitters, same ledger law |
| `dungeon/retract-zone` | dungeon + instance (`guardMany`) | `retractZone` + `revertMint`; server-checked: unrevealed, leaf-only, unoccupied, no encounter (D8) |
| `dungeon/graft-portal` | instance (version) | `graftStaticMap`; idempotent via `grafts`; no turn cost (crossing, not carving) |
| `dungeon/stage-wandering-result` | instance (version) | Appends the chosen row as a manifest entry on the party's zone (D7) |
| `dungeon/finish-expedition` (new) | dungeon + region (`guardMany`) | Not an extension — today's finish is a bare `setDungeonStatusAction` flip. Status → done + the fold (revealed generated sites → `discoveredSiteKeys`); refuses under a live encounter |

Client: expansion/retract/graft join the console via the existing two-token `useQueuedWrite` pair, folding both returned versions (`bump()`); the server-returned deterministic events replay through the shared client reducers on arrival — nothing about a roll is applied optimistically (D1). Stage-from-manifest is client-side prefill of the existing staging dialog — no new write.

## 5. Riders (standalone, land-anytime)

- **R1 — Pages substrate** (D3): schema + one-time migration, editor page tabs + zone picker, canvas optional `activePageId` + two-halves edge filtering, cross-page chips (in `ZoneNode`), snapshot/watch page support incl. `lastMovedTokenKey` — **plus the page-blind shipped surfaces**: the combat canvas, the staging dialog's zone picker, prep roster placement, the wandering zone picker, and the e2e factory geometry all enumerate zones flat today and need page grouping/labels. Independent value: multi-floor static dungeons.
- **R2 — `/stage` shell** (D9): route group, side-nav, `/maps` → `/stage/maps` redirects, empty Sets slot.

## 6. Build order

R1, R2 (parallel-safe) → **P1 Template Sets** (table, editor, tables + ranges, lint) → **P2 Region & the persistent place** (region table, persistent instance, mint/sweep/re-sync, prep against it — a hand-authored persistent megadungeon with zero procgen; de-risks D5 in isolation) → **P3 Generation engine + expand loop** (generation domain, events, stubs, gestures, turn cost, snapshot silhouettes; the layout tuning pass) → **P4 Sites & draws** (checklist, declarations, ledger, discovered-sites fold, objective UI) → **P5 Contents & wandering** (manifests, zone panel, stage prefill, wandering panel) → **P6 Portals** (graft, follow, watch page-following).

P1↔P2 may swap (Sets closer to their consumer); sequencing decided at ticket time. Each phase ends table-usable. Two prerequisites: **rebase/merge this docs branch onto main before cutting tickets** (it predates the UNN-540 merge it declares), and the **instance write lane's stale-retry** (`refetchVersion`, riding the UNN-567/568 write-queue core) must ship before P3's expand gesture, or a stale expansion dead-toasts mid-session.

## 7. Test spine

- **Property tests** (pure engine, seeded RNG): the K-guarantee (∀ seeds, exploration paths, **and retract sequences** — retract-then-re-expand must re-arm the draw and, via the stream cursors, roll a *different* result); every random mint passes two-way accepts; layout invariants (no overlap, half-plane respected under `edge`); sweep-by-provenance per the D5 table (authored/manual survive with reveal, generated dies completely, manifests clear); **re-sync ∘ graft preserves reachability** (the castle stays connected after a Map edit); graft idempotence; ledger law (any mint path consumes uniqueness + resolves declarations; `revertMint` restores the exact pre-mint ledger minus cursors).
- **Redaction release-gate extension** (D10): stub ≡ authored exit in payload shape **including id continuity across expand→reveal and expand→retract→re-expand**; provenance/manifests/ledger/templateKey/portalMapId never serialize.
- **Lint unit tests** per rule; `d100Ranges` normalizes by largest-remainder with a minimum width of 1 per row (no unhittable rows) and preserves weight order.
- **One e2e expedition-loop spec** via the factory (`createRegionTarget`): mint region → start expedition → expand → declared site appears → stage from manifest → finish → second expedition differs, castle reveal persists.

## 8. Deliberately deferred (unchanged from PRD unless noted)

Per-exit `accepts`; loop-closure probability UI beyond the per-set knob; `/stage` dashboard; quest structure (AND/OR graph — Planner territory if ever); player-facing objective tracker; multi-Region-per-campaign UX polish; rules-vault canonization of the two shipped procedures (turn cost, wandering).
