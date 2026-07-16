# Dungeon & Maps Visual Overhaul — Technical Design

> **Canonical source.** Companion to [PRD.md](./PRD.md); this document turns the PRD + the high-fidelity design handoff (`Showtime/artifacts/dungeons-redesign/design_handoff_dungeon_maps/` — README, two `.dc.html` prototypes, four screenshots) into decisions, file-level scope, and a build order. Where the PRD and the handoff disagree, the handoff's **interactive HTML** wins (its own README's rule: the HTML is the source of truth for layout/measurement/color/interaction); drifts are recorded in §8.
>
> **Status:** Draft · **Owner:** Jackson · Drafted 2026-07-15 against the surveyed codebase (post-#363); revised same day after adversarial review (engine-gate correction, lens semantics, a11y, input matrix, stub stability).

## 0. The through-line: React Flow already is the world

The handoff describes a bespoke renderer: fixed world-space rects, one camera transform (`translate(tx,ty) scale(k)`), detail derived from a single `zoom` value. The load-bearing realization is that **React Flow is already exactly this renderer**. Nodes live at authored world positions, the viewport is one transform, and everything inside scales uniformly with zoom — the prototype's `k = zoom/100` is precisely React Flow's viewport `zoom` (so the handoff's 20–160 band is `minZoom 0.2` / `maxZoom 1.6`).

So this overhaul is **not** a renderer swap and does not touch the canvas architecture (PRD scope boundary). It is six bounded moves, each decided once:

1. Three optional authored fields on `MapZone` + one new geometry event (D2, D9) — jsonb blob, **no migration**.
2. **One tiered set-piece card** in the canvas kit replacing the four divergent zone cards (D3).
3. Edges keep being React Flow edges; the **skin** changes from step-path to notch pair (D4).
4. A **derived-tier CSS regime**: `tier = f(viewportZoom)`, one `data-tier` attribute, CSS-only crossfade (D1).
5. New chrome: cartouche, minimap, tiered zoom control, roster inspector (D7, D8).
6. One pure engine selector: `hopDistances` BFS for the range lens (D5).

Everything below the visual layer — `MapGeometry`, `MapInstanceState`, reveal, occupancy, the snapshot projectors' structural redaction — is read as-is.

**One gate shapes every file placement below:** `depcheck.mjs` flags *type-only* imports in both directions that matter here. The engine gate matches any `@workspace/game*` import under `app/**`/`components/**` including whole-statement `import type` (the exemption exists only in the domain-purity scan), and the tier-direction gate (`scanTierViolations`) has **no type-only carve-out at all** — so the kit can't import the engine, *and domain can't import kit-owned types*. The resolution: **the view vocabulary lives in domain** (`domain/map/view/` for renderer vocabulary shared by the editor + dungeon, `domain/dungeon/view/` for live-instance shaping), where it can alias the engine enums directly — no parallel unions, no correspondence assertions — and the **kit imports downward from domain** (`components → domain` is the legal direction), staying engine-free in its own specifiers. The kit owns rendering, CSS, and components; domain owns the shapes they render. No new `ENGINE_IMPORT_ALLOWLIST` entries.

## 1. Decisions

### D1 — The camera is React Flow's viewport; tier is a pure derivation

**No new camera.** The handoff's `zoom` maps 1:1 onto React Flow's viewport zoom ×100. Tier is a pure function, never stored (PRD success criterion 4):

```ts
// components/shared/canvas/tier.ts
export type ZoneTier = "marquee" | "stage" | "closeup"

/** The handoff's hard breakpoints: <40 marquee, 40–110 stage, >110 closeup.
 *  MARQUEE_MAX is a named calibration knob — see the boundary-readability note. */
export const tierOfZoom = (zoomPct: number): ZoneTier =>
  zoomPct < MARQUEE_MAX ? "marquee" : zoomPct <= 110 ? "stage" : "closeup"

export const MARQUEE_MAX = 40
export const TIER_MIDPOINTS: Record<ZoneTier, number> = { marquee: 30, stage: 72, closeup: 138 }
export const ZOOM_MIN = 20
export const ZOOM_MAX = 160
export const ZOOM_STEP = 12 // the − / + buttons
```

- Each canvas subscribes via `useStore((s) => tierOfZoom(s.transform[2] * 100))` and stamps `data-tier={tier}` on the wrapper `div` around `<ReactFlow>`. Nodes are DOM descendants, so all tier styling is `group-data-[tier=…]` CSS — **no per-node React state, no re-render on tier change** (the layers are always mounted; only their visibility moves, D3).
- **Tier shortcuts** call `reactFlow.zoomTo(midpoint / 100, { duration: 200 })`; the slider and `−`/`+` write zoom directly (step ±12, clamped). All four inputs write the same value; the `NN% · <Tier> tier` readout and the highlighted tier label are both derived. Honors `prefers-reduced-motion` (duration 0), as `CanvasZoomCluster` already does.
- **Click-to-center** (DM console + watch, not the editor): `onNodeClick` → `setCenter(nodeCenterX, nodeCenterY, { zoom: currentZoom, duration: 200 })`. Centering never changes zoom — focus and detail stay orthogonal. The editor keeps click = select only (centering would fight drag-to-move).
- The DM console's viewport keeps persisting via the existing `readViewport`/`writeViewport` module store + `persistKey`; the editor keeps `fitView` on mount.

**The input matrix** — wheel moves from pan to zoom (tier navigation is the core gesture: "scroll to move between tiers"), which forfeits today's neutral wheel-pan, so every pan/select gesture is decided here, per surface:

| Gesture | Editor (`MapCanvas`) | DM console | Watch |
|---|---|---|---|
| Wheel / trackpad scroll | **zoom** (`zoomOnScroll`; `panOnScroll` off) | zoom | zoom |
| Pinch | zoom | zoom | zoom |
| Left-drag on pane | **box selection** (`selectionOnDrag`, unchanged) | pan (`panOnDrag`) | pan |
| Middle-drag · Space+drag | pan (`panOnDrag={[1]}` + `panActivationKeyCode="Space"`) | — (left-drag already pans) | — |
| Left-drag on node | move zone (unchanged) | — (nodes not draggable) | — |
| Touch one-finger drag on pane | pan — **coarse-pointer flip** (below) | pan | pan |

The editor keeps box selection as its left-drag (FigJam idiom) and gains middle-mouse/Space panning — the standard canvas-tool pair. **Touch needs an explicit fork:** with `selectionOnDrag` on, React Flow captures the primary touch pointer as box selection, and `panOnDrag={[1]}` has no touch equivalent — the matrix's mouse config would leave a touch editor unpannable. On coarse pointers (`(pointer: coarse)`), the editor flips to `panOnDrag={true}` + `selectionOnDrag={false}` (tap to select, one-finger pan, pinch zoom); verified with a touch-emulation browser test, not assumed. `minZoom={0.2} maxZoom={1.6}` everywhere.

**Boundary readability is a calibration gate, not an assumption.** At the Marquee→Stage boundary the math inverts: just under 40% the Marquee name renders ≈12 screen px (30 wu × 0.39); just over it the Stage name renders ≈7 px (17 wu × 0.40) — zooming *in* makes the zone's identity *less* readable. The prototype's README quotes Stage at k=1.0 and glosses the band's low end. Two knobs fix it, and P1b's gate includes browser-verifying **39/40/41 and 109/110/111** (not just midpoints): raise Stage header typography (name ≈22 wu, so ≈9 px at the boundary and ≈24 px at band top), and/or raise `MARQUEE_MAX` toward ~55 so Stage begins where its type is legible. Ship whatever the browser pass proves; the constants above are the only places the decision lives.

**Assertion (AC 4).** Footprint is a function of authored `size` alone (D2); nothing about the node's width/height reads zoom, selection, or turn state. A unit test pins `tierOfZoom`'s bands; a Playwright check (D10) asserts the same zone's bounding box is identical at all three tiers.

### D2 — Footprints: `size` → fixed world rects, grid-aligned

The authored `size` enum maps to one fixed world-unit rect (the PRD's open question, resolved). Dimensions are multiples of `CANVAS_GRID_SIZE = 16` so snapping is inherent; M matches today's card (`w-86 min-h-48` = 344×192) closely enough that existing maps don't reflow badly; the ladder tracks the handoff's sample rects (200×150 → 420×280).

```ts
// domain/map/view/footprints.ts — pure domain view vocabulary. ZoneSize simply
// aliases the engine enum (domain may import the engine), so there is no parallel
// union to keep in correspondence. The kit imports these downward (components → domain).
import type { MapZoneSize } from "@workspace/game-v2/spatial"
export type ZoneSize = MapZoneSize

export const ZONE_FOOTPRINTS: Record<ZoneSize, { w: number; h: number }> = {
  S: { w: 208, h: 144 },
  M: { w: 336, h: 192 },
  L: { w: 432, h: 256 },
  XL: { w: 560, h: 320 },
}
export const footprintOf = (size: ZoneSize | undefined) => ZONE_FOOTPRINTS[size ?? "M"]

/** Closeup token capacity — the handoff's two-column grid formula, minus the
 *  24-unit header row each rendered engagement cluster spends (interaction #18). */
export const zoneTokenCapacity = (size: ZoneSize | undefined, clusterCount = 0) => {
  const { h } = footprintOf(size)
  return Math.max(1, Math.floor((h - 64 - 24 * clusterCount) / 46)) * 2
}
```

Derived capacities (no clusters): **S 2 · M 4 · L 8 · XL 10** — a 4v4 set piece is authored into an L or XL room and renders full tokens; anything smaller degrades gracefully (D7). Cluster overhead is part of the capacity API, not a side rule: two disjoint melee pairs in an M room compute `cap = max(1, ⌊(192−64−48)/46⌋)×2 = 2 < 4` and correctly degrade to the condensed stack — unit-tested exactly so. `MapZone.position` stays the stored top-left anchor; a size change grows/shrinks right-and-down and needs no re-snap (dims are grid multiples).

**Footprint collision warning is net-new** (PRD drift: the "existing overlap warning" doesn't exist — today's warnings are `disconnectedZoneIds` + `duplicateZoneNames` only). Add a pure `overlappingZonePairs(rects)` beside the footprints and surface it through the existing `WarningsBanner`, same non-blocking posture.

The footprint map lives in **`domain/map/view/`**, not the engine and not the kit: the PRD is explicit that size has no mechanical meaning, so the engine never learns what an "L" is — but the *loader* needs footprints to compute stub exit positions (D4) and `lib` may not import the kit, while both `lib` (peer) and `components` (downward) may import domain. One home satisfies every consumer: node style, threshold placement, minimap, capacity, overlap warning, exit-side projection.

### D3 — One tiered set-piece card for all four surfaces

Today four cards drift apart (shared `ZoneNode`, DM `ZoneCardFrame`, watch `zone-node` + `combat-zone-node`). The overhaul's card is decided once, in the kit — and the kit is **engine-free** (§0), so the card renders a presentation-owned view shape:

```
components/shared/canvas/set-piece/
├── zone-set-piece.tsx     The card: reveal/mood/occupancy/party classes + the three stacked layers
├── motif-icons.tsx        The 11 glyphs (10 motifs + route) vendored from the handoff as real <svg> components
├── occupant-chips.tsx     Marquee pips · Stage avatar chips · Closeup token · condensed avatar stack
└── hop-badge.tsx          The range-lens badge (route glyph register, ★ origin, h1–h4 de-emphasis)
```

```ts
// domain/map/view/set-piece-view.ts — the card's view vocabulary. ZoneMotif/ZoneMood
// alias the engine enums exactly as ZoneSize does (D2); the kit imports these types
// downward and never names the engine.
export type ZoneMotif = MapZoneMotif   // water | stair | bones | statue | altar
                                        // | treasure | crates | cell | mechanism | tomb
export type ZoneMood = MapZoneMood     // warm | dim | cool

export type SetPieceOccupant = {
  key: string
  name: string
  initials: string
  faction: "party" | "hostile" | "neutral"
  owned: boolean                         // viewer's stake — gold treatment; 0..n per zone
  hp?: { label: string; pct: number }    // omitted ⇒ redacted (watch hostiles)
  sp?: { pct: number }                   // party members only
  acting?: boolean                       // combat: white acting ring (stays distinct from gold)
  engagementGroup?: number               // combat: melee-cluster id, MULTI-MEMBER clusters only —
                                          // groupTokensByEngagement returns Free combatants as
                                          // singletons, and a singleton is not a melee
}

export type ZoneSetPieceView = {
  name: string
  description: string
  size?: ZoneSize
  motif?: ZoneMotif
  mood?: ZoneMood
  reveal: "revealed" | "unmapped"        // watch payloads only ever contain "revealed"
  party: boolean                         // gold keyline
  hop: { label: string; origin: boolean } | null   // null ⇒ unreachable, no badge
  occupants: SetPieceOccupant[]
  summary: string                        // "Combat · 4 v 4", "2 hostiles", "" — also the future contents-teaser home
  hasDmNotes?: boolean                   // Stage-tier note glyph, DM surfaces only
}
```

The **engine→view mapping is decided once, in domain builders** (the view *types* live in `domain/map/view/set-piece-view.ts`; the live-instance *builders* in `domain/dungeon/view/`, composing the existing `domain/combat/view/` shaping): they read `MapZone`/`MapInstanceState`/roster shapes, derive `owned` from the viewer's `ownedCharacterIds` (an **array** — a viewer can own several party tokens; every owned token goes gold), and derive `engagementGroup` from the existing `engagement-groups.ts` connected-cluster partition, **assigning it only to groups with more than one member** (the partition returns Free combatants as singletons — a boolean couldn't represent two independent melees in one zone, and a singleton "cluster" would ring every free token). The feature canvases call one builder and hand the kit finished views; the kit imports the view types downward from domain, so nothing is duplicated and nothing needs a correspondence assertion.

- **Three stacked layers** (`absolute inset-0`, always mounted), visibility driven purely by `data-tier`. **Opacity alone is not enough** — `opacity: 0` leaves invisible names and buttons in the accessibility tree and tab order — so the crossfade pairs it with delayed visibility, which removes hidden layers from both:

  ```css
  .layer { opacity: 0; visibility: hidden; transition: opacity .3s ease, visibility 0s linear .3s; }
  [data-tier="stage"] .layer-stage { opacity: 1; visibility: visible; transition: opacity .3s ease; }
  /* (same pair per tier; reduced-motion collapses both transitions to 0s) */
  ```

  The incoming layer becomes visible immediately and fades in; the outgoing layer fades out, then leaves the tree. No reflow, no remount, no React state. Layers are `pointer-events-none` except explicitly interactive children ("Open roster ▸").
- **Marquee layer:** 56-world-unit motif glyph + 30-unit name + faction pips (≤6). No motif ⇒ name + pips only.
- **Stage layer:** header (motif + name + hop badge + dm-notes glyph), one-line italic clamped `description`, then a bottom-anchored occupancy footer: summary line + avatar chips (≤6), no names. Header type sized per D1's boundary-calibration gate (start at name ≈22 wu, adjust in the browser pass).
- **Closeup layer:** compact header, fuller description, hop badge, then the roster: full two-column tokens when `occupants.length ≤ zoneTokenCapacity(size)`, else the condensed stack + "Open roster ▸" (D7). Empty zones render italic muted *"Unoccupied"* — the word "Empty" dies everywhere. A `manifestSlot?: ReactNode` prop reserves the Procedural Dungeons region, shipped empty.
- **Card surface classes** (one fact per channel, §D6 for tokens): mood wash on the background; `occupied:after` uniform lit gradient (binary — identical for 1 or 5); reveal on the border (`solid` vs `dashed` + interior content at `opacity-50` — the *content* dims, never the frame); `party` = gold keyline + soft glow; `selected` = 1.5px white ring, and when both, party's gold wins with a slightly stronger glow (prototype's `.party.sel`).
- **Accessibility contract preserved:** the card keeps `aria-label="Zone: <name>"` **exactly** — stable, name-only (load-bearing in `dungeon-watch.spec.ts`, and a label that changed with reveal/occupancy would churn on every state flip). State rides *visible text and glyphs* (the summary line, "Unoccupied", the reveal glyph) referenced via `aria-describedby`, never color alone and never folded into the label.
- The four surface nodes become thin wrappers: template editor `ZoneNode` (adds handles + editor toolbar + size stepper), DM explore `DungeonZoneNode` (reveal/move-party/details toolbar), DM combat `DungeonCombatZoneNode` (move-target toolbar, enchantment accessory via a `closeupAccessory` slot, engagement clusters from `engagementGroup`), watch nodes (no toolbar; exits dissolve into thresholds, D4). `ZoneCardFrame` and the watch cards' bespoke `<Card>` shells retire.
- **Interactive children stop propagation.** Token buttons (the combat watch's `CombatantDrawer` opener), "Open roster ▸", and toolbar children all `stopPropagation()` so a token tap never doubles as a zone click — one rule, stated once, applied in the kit's chip/token components.

Typography discipline: everything on the card is Hanken Grotesk (`font-sans`); DM Serif Display (`font-display`) appears only in the cartouche (D8).

### D4 — Thresholds stay React Flow edges; the skin is a notch pair

Killing the drawn line does **not** mean killing the edge. Connections remain RF edges (connect-by-drag and live update while dragging nodes come free); the custom edge component stops rendering a path and instead renders **two notch buttons in `EdgeLabelRenderer`** (which paints above the node layer — notches must sit on top of card borders).

**Losing the path means losing `BaseEdge`'s built-in interaction surface — the notches must replace it explicitly:**

- Each notch is a **native `<button>`** (not a labeled `div`): focusable, `aria-label` from the existing `connectionStateLabel` vocabulary ("Threshold to The Nave — locked"), `className="nopan"` and `style={{ pointerEvents: "all" }}` (both required — `EdgeLabelRenderer` children are pointer-inert by default).
- **Selection is wired, not inherited:** click/Enter calls the RF store's edge-selection update (`addSelectedEdges`) so the edge participates in RF selection state exactly as before; Escape deselects. Both notches render the selected treatment together.
- The edge component records **which notch was activated** (`anchor: "a" | "b"` in local state); the editor's Hidden/Locked/Delete toolbar anchors at that notch instead of the dead midpoint.
- Keyboard order: notches are tabbable in edge order; focus shows the same glow as hover (`:focus-visible`).
- **Hit targets** (PRD open question, resolved): the button's padded hit area counter-scales by `1/k` so it never falls below **44 screen px** — at Marquee (k≈0.3) a 32-world-unit notch is 10 screen px, far too small; the counter-scaled pad keeps touch viable at every tier.

**Placement** — the handoff's algorithm verbatim, plus a clamp the prototype omits (its fixture always overlaps; the freeform editor doesn't guarantee it):

```ts
// domain/map/view/threshold-geometry.ts (pure, unit-tested — homed in domain beside
// footprints because BOTH the kit (rendering, downward import) and the dungeon
// loader in lib (stub exit projection, peer import) consume it; lib may not import the kit)
const NOTCH = { along: 32, across: 12 } // world units; jambs are 1.5px borders

export function thresholdAnchors(a: Rect, b: Rect): [NotchAnchor, NotchAnchor] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) >= Math.abs(dy)) {
    const [left, right] = dx > 0 ? [a, b] : [b, a]
    const mid = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2
    return [
      { x: left.x + left.w, y: clampAlongEdge(mid, left.y, left.h), orient: "v" },
      { x: right.x, y: clampAlongEdge(mid, right.y, right.h), orient: "v" },
    ]
  }
  const [top, bottom] = dy > 0 ? [a, b] : [b, a]
  const mid = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2
  return [
    { x: clampAlongEdge(mid, top.x, top.w), y: top.y + top.h, orient: "h" },
    { x: clampAlongEdge(mid, bottom.x, bottom.w), y: bottom.y, orient: "h" },
  ]
}

const clampAlongEdge = (v: number, edgeStart: number, edgeLen: number) =>
  Math.min(Math.max(v, edgeStart + NOTCH.along / 2 + 8), edgeStart + edgeLen - NOTCH.along / 2 - 8)
```

When the two zones' facing ranges don't overlap, each notch clamps onto its own zone's nearest edge corner — the pair still faces its partner as directly as the geometry allows.

**Axis choice corrects the handoff (UNN-633 build note).** The prototype picks the wall axis by center-to-center dominance (`|dx| >= |dy|`), which its always-overlapping fixture never stresses. In the freeform editor that is wrong: two zones that overlap on one axis and are separated on the other (a zone slightly up-and-right of another) must connect through their *shared band* — the wall facing the **gap** — not the wall the center vector happens to favor. So the shipped `thresholdAnchors` picks the axis on which the rects **don't** overlap (shared x-band → top/bottom notches; shared y-band → left/right), falling back to center dominance only when they overlap on both axes (a real collision) or neither (a pure diagonal). The partner-name tag likewise points at the *partner's notch* (2D dominant axis), not the wall normal, so it stays correct under the collision fallback.

**Visual state is a decided-once mapping** from the existing model — border style carries secrecy/knowledge, the padlock glyph carries locked, composable because they're separate channels. The mapping function (`thresholdStateOf`) reads engine shapes (`MapConnection`, fog state), so it lives in **`domain/map/view/threshold-state.ts`**, not the kit; the kit receives the finished state string:

| Derived state | From | Notch renders |
|---|---|---|
| `open` | surfaced, both zones revealed | plain notch pair (void fill + 1.5px `--muted-foreground` jambs) |
| `locked` | `locked` && not runtime-unlocked | + padlock glyph centered in the notch |
| `secret` | `hidden` && not revealed-to-players | dashed jambs + center dot — **DM surfaces only** |
| `unmapped` | surfaced but partner zone unrevealed | dotted jambs at 50% opacity |

This is `fog`/`hidden`/`locked` re-skinned — `connectionFogState` and the current `DungeonConnectionEdgeData` already carry everything. A locked secret door renders dashed **and** padlocked.

**Pairing legibility.** Hovering, focusing, or selecting either notch lights both notches + the partner card; no tether ever renders. Since the two notches and the partner card live in different DOM branches, the canvas provides a tiny `HoveredConnectionContext` (`{ connectionId, zoneIds } | null`) — the edge sets it on hover/focus/selection, notches and cards read it for the glow class. Partner-name labels ("⇢ The Nave") render as a small world-positioned tag beside the notch: always at Closeup, on hover/selection at Stage, never at Marquee (`data-tier` CSS again). A label naming a *page* instead of a zone is the designed home for Procedural Dungeons' portal chip.

**Watch stubs.** `SnapshotExit` (known-exit, far zone structurally absent) renders as a **lone notch opening into darkness** on the revealed zone's rim. Placement must be **stable across the stub→connection transition** — and the wall alone isn't enough: a revealed connection's notch sits at the overlap-band *midpoint along* the wall, so a stub pinned to a fixed slot on the right wall would still slide along it the moment the partner reveals. Stability therefore means shipping the full anchor: `SnapshotExit` gains **`side: "n" | "s" | "e" | "w"` + `offset`** (the along-wall coordinate, normalized to the near zone's edge), computed by **the same `thresholdAnchors` function with the same inputs** the revealed renderer will use — identical by construction, no transition jump possible. Two placement subtleties: coincident stubs on one wall (two hidden partners behind the same overlap band) nudge apart deterministically in exit-id order by one notch-length; and the computation happens in the **dungeon loader (`lib`)**, which imports `thresholdAnchors` + footprints from `domain/map/view/` (peer import) and passes the finished `{side, offset}` into the projector as a parameter — the engine stays footprint-blind (D2), and redaction still exits through the one projector file.

This is a **deliberate, documented scalar leak**: the payload discloses where on the wall the doorway sits (the fiction demands it — the doorway into darkness has a location) but still no partner id, name, distance, or geometry. Two tests pin it: the engine projector test asserts `SnapshotExit`'s **exact wire keys** (`id`, `zoneId`, `locked`, `side`, `offset` — nothing else; payload-level redaction), and a Playwright transition test captures the stub notch's box, reveals the partner, and asserts the revealed notch lands in the same place (rendering-level stability). Generated Procedural-Dungeons stubs carry a side+offset inherently (their pending direction), so indistinguishability survives: one render path, one shape. Locked stubs keep the padlock glyph. `ExitChip` and the watch cards' exits footer are deleted.

**Editor flow carries over:** drag from a rim handle still previews via `FloatingConnectionLine` — the one line that ever renders, gone on release. `EdgeFlagBadge`'s glyph+text vocabulary moves onto the notch labels; the old step-path edge skins retire, and `useFloatingEdgePath` survives only under the drag preview.

### D5 — The range lens: one BFS selector, one policy home

**Engine half** — a pure selector next to `adjacencyOf` (spatial one-way seam holds: no encounter/combat/visibility imports, gated by `depcheck`):

```ts
// packages/game-v2/src/spatial/selectors.ts
/**
 * Hop distance from the nearest origin to every reachable zone — multi-source BFS.
 * Traversability policy is the caller's: pass exactly the connections the surface
 * counts. Zones absent from the result are unreachable (no badge).
 */
export function hopDistances(
  connections: Iterable<Pick<MapConnection, "fromZoneId" | "toZoneId">>,
  originZoneIds: readonly string[],
): Record<string, number>
```

Unit-tested (AC 5): chains, cycles, disconnected zones, multi-source min-distance, empty origins.

**What a hop means** — pinned to the rulebook, not to geometry: *"Two Zones are adjacent if a character can travel from one to the other without crossing a third Zone. The DM determines adjacency based on the environment. A staircase, a bridge, or an open archway connects the Zones it joins, while a locked door, a chasm, or a sheer wall might separate them"* (rules §3.5). In this app, **an authored connection is that DM ruling, reified** — a DM who draws a connection has ruled the zones adjacent; a locked door that truly separates two zones is authored as *no connection*, while a locked connection means "adjacent, but Travel is blocked until unlocked." The lens therefore measures **authored adjacency**: all connections count on DM surfaces (including locked and secret — the DM's own ruling, and range in hops rides adjacency, not traversability), and the watch counts the connections in its redacted payload (the players' known map, structurally).

**The policy lives in one place** — `apps/web/domain/dungeon/view/range-lens.ts`: one builder that takes the surface's connection set + origin policy and returns the per-zone badge map. DM and watch callers pass different inputs; neither re-decides what counts. If the table rules that locked doors should not carry range (a live game-design question, §8), the fix is one filter in this one builder.

**Origin policy** (always-on lens, PRD-resolved):

| Surface | Default origin | Re-origin |
|---|---|---|
| DM explore | all party-occupied zones (multi-source; occupancy ∩ placed characters — the `load-dungeon-snapshot.ts` pattern) | selecting any zone → single-source from it; deselect → back to party |
| DM combat | the acting combatant's zone | same |
| Watch | party-occupied zones (explore snapshots carry party tokens only) | none — the watch has no selection (D7) |

The combat default answers "who can Maragion reach from here?" the moment their turn starts. **No channel collision with combat's move affordances** (the PRD's open question): move targets are `NodeToolbar` buttons ("Move {actor} here"), the acting mark is a white token ring, and the hop badge is a title-row register — three different homes, no shared visual channel, so the always-on lens composes with combat unchanged.

**Badge register** (never mistakable for a count): the `mi-route` glyph + number in a pill, opacity de-emphasis by distance (h1 = 1, h2 = .86, h3 = .72, h4+ = .6). The **origin zone** gets the gold `★` badge (`★ Party` at Stage when the origin is the party's zone); the origin's own route glyph is suppressed. `aria-label`: "2 zones from the party" / "Party is here".

### D6 — Channels: washes, occupancy, reveal, gold — each enforced

New tokens in `packages/ui/src/styles/globals.css` (already OKLCH, dark-only):

```css
--void: #070709;                               /* offstage dark / notch fill */
--mood-wash-warm: oklch(0.62 0.08 75);
--mood-wash-dim:  oklch(0.62 0.02 285);
--mood-wash-cool: oklch(0.62 0.08 262);
--mood-warm: color-mix(in oklab, var(--card), var(--mood-wash-warm) 13%);
--mood-dim:  color-mix(in oklab, var(--card), var(--mood-wash-dim) 13%);
--mood-cool: color-mix(in oklab, var(--card), var(--mood-wash-cool) 13%);
```

- **The equal-luminance constraint becomes a CI gate** (Code Style #8 — promote the normative comment): a vitest **in apps/web** (which has a configured runner; `packages/ui` has no test command) reads the ui package's `globals.css` and asserts every `--mood-wash-*` is `oklch(0.62 …)` and every `--mood-*` mixes at exactly `13%`. Adding a fourth hue later is legal; moving brightness is a red build.
- **Occupancy** is the `occupied::after` gradient (`linear-gradient(180deg, oklch(1 0 0 /.08), oklch(1 0 0 /.015) 55%, transparent)`) — binary, uniform, the only channel allowed to move brightness.
- **Reveal** is border style only: solid vs dashed (+ content dim). Exactly two zone states; secret-vs-uncharted stays a *connection* property (D4). The DM canvas's current top-left reveal legend (three states) is replaced by this two-state vocabulary.
- **Gold rationing:** the party zone's keyline + glow, the `★` origin badge when the origin is the party, the viewer's **owned tokens** (`TOKEN_OWNED_STYLE`, unchanged — a viewer may own several; each renders gold, matching today's watch), the minimap party rect + camera frame, and the cartouche hairlines. Nothing else — notches are neutral hardware, non-owned allies are blue (`--sp` tint per the handoff token spec), hostiles red.
- **Token faction styling** (Closeup + inspector): owned = gold border/tint, non-owned party = `--sp` blue, hostile = `--destructive` red, neutral = plain — the handoff's `color-mix` recipes, homed as classes beside the set-piece card. HP bar emerald, SP bar `--sp`, party-only. (The handoff's "exactly one gold token" is its fixture's fiction — one viewer, one character — not a rule; cardinality is 0..n by `ownedCharacterIds`.)

### D7 — Crowded zones and the roster inspector

**Capacity** comes from D2's formula. At Closeup, `occupants.length ≤ cap` renders the full two-column token grid in-card; over cap, the card degrades to the **condensed avatar stack** (≤6 overlapping 26-unit avatars, −8 margin, 2px card-colored borders, `+N` overflow) with an always-visible **"Open roster ▸"** button. Tokens are never clipped.

**The inspector is a new, non-modal floating panel — not a `ResponsiveDialog`.** The repo's Sheet convention is modal (overlay, focus trap); the inspector must coexist with live canvas interaction (you keep zooming, clicking, re-targeting it). Per the prototype: absolutely positioned inside the stage (`top-16 right-16 bottom-[82px] w-[344px]`), translucent + blur, slides in (`translateX(24px)→0` + fade, .28s, reduced-motion aware). It budgets space by **combatant count, not room size**: header (motif + zone name + close ×), uppercase summary line, then a scrollable two-column token grid. In combat it preserves the engagement partition — tokens group by `engagementGroup`, clusters first, mirroring `engagement-groups.ts`. Home: `DUNGEON/_components/canvas/roster-inspector.tsx`, shared by explore, combat, and watch canvases (same feature subtree). On mobile (`useIsMobile`) it renders as a non-modal bottom drawer (`Drawer modal={false}`) so the canvas stays live.

**One panel/focus state machine** (the review's contradiction, resolved — *click*, *selection*, and *inspection* are three different things):

- `inspectId: string | null` — owned by the phase body (explore body / combat body / watch), **independent of the camera and of RF selection**. Opening it never moves the camera; moving the camera never closes it.
- **Zone click** (DM console + watch — the editor's click stays select-only, D1; it has no inspector): center the camera + set `inspectId = occupied ? zoneId : null`. Clicking the pane clears `inspectId`.
- **Selection** (DM console only): the same click also RF-selects (white ring, lens re-origin). The watch keeps `elementsSelectable={false}` — `onNodeClick` still fires for center+inspect, but there is **no ring and no lens re-origin** player-side; D5's watch row and this row are the same statement.
- **Nested controls never bubble**: token buttons (combat watch's `CombatantDrawer`), "Open roster ▸", and toolbar children `stopPropagation()` (D3). "Open roster ▸" is the zone-click action made explicit on crowded cards, always visible.
- The close `×` clears `inspectId` only — camera, selection, zoom untouched.
- **Inspector ≠ details sheet.** The console keeps two right-hand panels with different jobs: the inspector (read-only roster, opens by clicking occupied zones) and the existing `DungeonZoneSheet` details sheet (authoring/reveal hub, opens from the node toolbar's "Zone details"). They would collide at `right-16`; opening either closes the other. The editor has only the details sheet. The `CombatantDrawer` (a modal detail surface) already exists on the combat watch and stays as-is; opening it does not disturb `inspectId`.

### D8 — Chrome: cartouche, minimap, working bar

**Cartouche** — `components/shared/canvas/canvas-cartouche.tsx`, pinned top-center, `pointer-events-none`: title in `font-display` (24px) flanked by gold hairline gradients (`::before`/`::after`), uppercase tracking subtitle. Identity only, never live state. Per surface: DM console + watch show the dungeon name; the editor shows the map name. **Subtitle:** DM console + editor render "N zones"; the **watch omits the count** — its payload holds only *revealed* zones, so any number it printed would either lie or leak the true total. The handoff's "Tide-drowned temple" theme line has no data source (no `theme` column on `maps`/`dungeons`), and the PRD's schema boundary (three MapZone fields, no migrations) forbids adding one now; the slot is designed for it (§8).

**Minimap** — start with React Flow's `<MiniMap>`, which supports everything the design needs: a custom `nodeComponent` (an SVG rect per zone — dashed stroke for unmapped, gold fill for party, lit fill for occupied), `maskColor`/mask styling for the viewport frame, and free pan/zoom interactivity. Restyle it to the prototype's look (`~176×96`, panel chrome, gold viewport stroke); fall back to a bespoke component **only if** a concrete fidelity gap survives that attempt (none is currently known — the draft's "RF can't do dashed/gold" claim was wrong). Position **bottom-left** (the prototype and all four screenshots put it there; the PRD's "bottom-right" text predates the handoff — the right rail belongs to the inspector). On by default in the DM console, toggleable; the toggle persists in the same **in-memory module store** as the viewport (`viewport-store.ts` — session-scoped by design, resets on full reload; there is no localStorage precedent to match). Off by default on the watch; absent in the editor.

**Working bar** — the existing `TurnLoopBar` keeps Play/Edit, turn counter + advance, start-encounter, finish-delve, and swaps `CanvasZoomCluster` for its grown form: `−` / range slider (20–160, step 1) / `+`, the `NN% · <Tier> tier` readout, and the Marquee/Stage/Closeup shortcut labels with the derived tier highlighted (never an independent selector — D1). `CanvasZoomCluster` itself grows these (one component, used by the DM bar, the editor toolbar, and a new minimal watch bottom bar that replaces RF `<Controls>` so players get the same tier vocabulary).

The console's left party sidebar is untouched. The prototype's "How to explore" hint card is optional polish (P4), pinned at the sidebar bottom.

### D9 — Writes: one new geometry event through the existing seam

The three fields ride the established authoring path (schema → event → reducer → dispatcher → sheet):

```ts
// packages/game-v2/src/spatial/geometry.schema.ts — additive, all optional
size:  z.enum(["S", "M", "L", "XL"]).optional(),
motif: z.enum(MAP_ZONE_MOTIFS).optional(),   // the 10: water stair bones statue altar treasure crates cell mechanism tomb
mood:  z.enum(["warm", "dim", "cool"]).optional(),
```

- **Optional, not defaulted** — absent stays absent (the load-schema fixed-point law; render-side defaulting is `?? "M"` / no glyph / `?? "dim"`). Existing blobs parse unchanged; **no SQL migration** (jsonb, `.$type` only). `__fixtures__/arbitraries` gains the three fields.
- **Motif is a closed enum** (PRD's implementation call, decided): 10 glyphs, vendored as real `<svg>` components (per the handoff's own advice against CSS masks) in `motif-icons.tsx`, `Record<ZoneMotif, Icon>` registry. Extending means adding an enum member + an icon — a PR, not an authoring surface.
- One new event kind, mirroring `setZoneText` but with an explicit **clear opcode**: `{ kind: "setZoneIdentity", zoneId, identity: { size?: MapZoneSize, motif?: MapZoneMotif | null, mood?: MapZoneMood } }`. Absent field = no change; **`motif: null` = clear** — the reducer *deletes the key* (never stores `null`/`undefined`, preserving the fixed-point law), which is what the picker's "None" dispatches. The reducer test pins the round trip: set → clear → the persisted zone deep-equals the never-set zone. One reducer arm in `reduce-map-geometry.ts`; the instance side's `editGeometry` arm nests geometry events, so the DM console's live edit path inherits the new kind with zero instance-event work.
- **Editing surfaces:** `ZoneDetailsSheet` gains the three pickers (size = segmented S/M/L/XL, motif = glyph grid with "None", mood = three-swatch segmented control — each swatch labeled, not color-alone); the `ZoneNode` toolbar gains the compact size stepper. Both the template editor and the DM console's Edit mode get this for free through the shared `MapCanvas`.
- **Snapshot passthrough:** `SnapshotZone` + `DungeonSnapshotZone` (visibility projectors) add optional `size`/`motif`/`mood` — player-visible identity on revealed zones, exactly like `description` today. `SnapshotExit` adds `side` (D4). `dmNotes` stays withheld.

### D10 — Test posture and e2e stability

Split by what each runner can actually prove (`apps/web` vitest defaults to Node; DOM tests opt into jsdom; jsdom performs **no CSS layout**, so anything about boxes, readability, focus order, or hit-target size belongs in the browser):

- **Pure vitest (Node):** `tierOfZoom` bands (D1), `thresholdAnchors` incl. the no-overlap clamp + the stub `{side, offset}` derivation (D4), `hopDistances` (D5), `zoneTokenCapacity` incl. cluster overhead (two disjoint pairs in an M room degrade — D2) + `overlappingZonePairs`, the `setZoneIdentity` reducer arm incl. the null-clear round trip (D9), the wash-luminance CSS-regex gate (D6), the domain builders (set-piece view incl. multi-member-only `engagementGroup`, `thresholdStateOf`, range-lens policy). **Engine projector wire-key test (AC 3, payload half):** `SnapshotExit` serializes exactly `{id, zoneId, locked, side, offset}` — no other keys, ever.
- **RTL/jsdom (structure, not layout):** the **state-matrix fixture (AC 2)** — render `ZoneSetPiece` across {empty, hostile-occupied, party} × {revealed, unmapped} minus the unreachable party-unmapped cell, asserting each cell's (border-style class × fill class × glyph/text) triple is distinct and aria-complete. The **AC 3 rendering half** — render a stub threshold and assert the DOM contains no partner id/name/geometry beyond `side`/`offset`.
- **Playwright (layout + interaction truths):** the same zone's bounding box identical at 30/72/138 zoom (AC 4); boundary readability at **39/40/41 and 109/110/111** (D1's calibration gate); hidden tier layers excluded from the a11y tree and tab order (D3's visibility rule); notch focus/selection/keyboard flow and the ≥44 px hit target (D4); the **stub→reveal transition** (capture the stub notch box, reveal the partner, assert the revealed notch box matches — D4); the editor's coarse-pointer pan/select flip under touch emulation (D1); inspector/details-sheet mutual exclusion (D7); the crowded-zone path (AC 1: stack + "Open roster ▸" + inspector renders all 10).
- **e2e stability (AC 6):** the load-bearing selectors survive by contract — `aria-label="Zone: <name>"` on the set-piece card, token names as text. Known selector updates: `ExitChip`'s "Unexplored exit"/"Locked exit" text becomes the stub notch's `aria-label`; the reveal-legend assertions (if any appear) move to the border vocabulary. `maps.spec.ts` never touches zone internals; `dungeon-combat.spec.ts` lives on the working bar, which keeps its accessible names.

## 2. Interaction spec — the subtleties, in one place

Distilled from `DM Explore Interactive.dc.html` (`renderVals()` + handlers); each row is normative:

| # | Interaction | Spec |
|---|---|---|
| 1 | Wheel over canvas | zooms (RF `zoomOnScroll`), clamped 20–160, all surfaces. Pan gestures per D1's input matrix (editor: middle-drag/Space+drag; console+watch: left-drag). |
| 2 | Zoom slider / `−` `+` | slider writes continuously (`step 1`); buttons step ±12 clamped. Readout `NN% · <Tier> tier` updates from the derived value. |
| 3 | Tier labels | shortcuts, not selectors: animate zoom to the band **midpoint** (30 / 72 / 138) over 200ms; the label for the *derived* tier renders highlighted even when zoom sits elsewhere in the band. |
| 4 | Tier change | CSS crossfade: opacity 300ms + delayed `visibility` (hidden layers leave the a11y tree and tab order), all three layers permanently mounted — **no reflow, no remount, no React state**. Camera transform eases 200ms. Both honor reduced motion. |
| 5 | Click a zone | DM console + watch: center the camera (200ms, zoom unchanged) + inspector open-if-occupied / close-if-empty. DM console additionally RF-selects (white ring + lens re-origin); the watch has no selection state (`elementsSelectable={false}`), no ring, no re-origin. The **editor** click selects for editing only — no centering, no inspector (D1). |
| 6 | Click empty pane | DM: deselect + lens re-origins to the surface default (party / actor). All surfaces: inspector closes. |
| 7 | "Open roster ▸" | the zone-click action made explicit — always visible on crowded cards (not hover-gated); stops propagation. |
| 8 | Inspector close `×` | clears `inspectId` only. Camera, selection, zoom untouched. |
| 9 | Selection vs party ring | selected = `0 0 0 1.5px` white ring; party = gold keyline + `0 0 34px` glow; both = gold keyline with the stronger (44px) glow — gold always wins the border. |
| 10 | Threshold hover/focus/selection | both notches + the partner card glow (via `HoveredConnectionContext`); **no tether line, even on hover**. Partner-name tag: Closeup always, Stage on hover/selection, Marquee never. |
| 11 | Threshold activation | notches are native buttons: click/Enter selects the connection via the RF store; the Hidden/Locked/Delete toolbar anchors at the activated notch; Tab reaches notches in edge order; hit target ≥44 screen px at every tier (counter-scaled pad). |
| 12 | Connect drag (editor) | rim handle drag shows `FloatingConnectionLine` — the only line in the system — replaced by the notch pair on release. |
| 13 | Unmapped dimming | dashed border on the frame; the *interior content* renders at 50% opacity (name, pips, glyph — prototype's `.unmapped .mpn,…{opacity:.5}`). The frame itself never dims (border legibility). |
| 14 | Occupant caps | Marquee pips ≤6; Stage chips ≤6; condensed stack ≤6 avatars then `+N`. The inspector always shows everyone. |
| 15 | Empty at Closeup | italic muted "Unoccupied" — identity (glyph, name, description, wash) is the content; no apology row. |
| 16 | Minimap | zone rects live-classed (party gold / occupied lit / unmapped dashed); gold viewport frame tracks the camera continuously, clamped to world bounds, 200ms ease. |
| 17 | Camera model divergence | the prototype has **no free pan** (camera = focused zone only); production keeps RF drag-pan. Click-to-center is an affordance layered on top, not a constraint. |
| 18 | Engagement clusters (combat) | dashed-`--destructive` sub-containers in the closeup token grid, one per **multi-member** `engagementGroup` (Free combatants come back from `engagement-groups.ts` as singletons and get no cluster), each with the "⚔ engaged" tag pill. Entering combat is **not a screen change** — clusters just populate. Cluster overhead is inside the capacity API: `zoneTokenCapacity(size, clusterCount)` subtracts 24 units per cluster row, so two disjoint pairs in an M room degrade to the condensed stack; the inspector preserves the grouping. |
| 19 | Watch stubs | lone notch + darkness at the **true anchor** (`SnapshotExit.side` + `offset`, computed loader-side by the same `thresholdAnchors` the revealed renderer uses) — position-identical when the far zone reveals, by construction; coincident stubs nudge apart in exit-id order. Locked stubs carry the padlock. No partner id/name/geometry in the payload beyond `side`/`offset` (AC 3). |
| 20 | Hop badges | route-glyph register at every tier; ★ gold on the origin ("★ Party" at Stage width); opacity fades h1→h4+; unreachable zones show nothing. |
| 21 | Nested controls | token buttons (combat watch drawer), "Open roster ▸", toolbar children: `stopPropagation()` — a token tap never doubles as a zone click. |

## 3. Schema & engine deltas (exhaustive)

| Change | File | Nature |
|---|---|---|
| `size`/`motif`/`mood` optionals + `MapZoneSize`/`MapZoneMotif`/`MapZoneMood` types | `packages/game-v2/src/spatial/geometry.schema.ts` | additive; no migration |
| `setZoneIdentity` event (with `motif: null` clear opcode) + reducer arm | `spatial/geometry-event.ts` (the `mapGeometryEventSchema` union) + `reduce-map-geometry.ts` — the instance side's `editGeometry` arm nests geometry events, so the DM console's live edit path inherits the new kind with zero instance-event work | additive |
| `hopDistances(connections, origins)` | `packages/game-v2/src/spatial/selectors.ts` + barrel export | new pure selector; spatial one-way seam untouched |
| Snapshot passthrough: `size`/`motif`/`mood` on `SnapshotZone` + `DungeonSnapshotZone`; **`side` + `offset` on `SnapshotExit`** — the values arrive as a projector *parameter* computed by the dungeon loader via `domain/map/view` geometry (the engine never learns footprints, D2/D4); wire-key test pins the exact serialized shape | `packages/game-v2/src/visibility/spatial-snapshot.ts` (+ the loader call sites in `lib/db/queries/`) | additive optionals + two fields |
| Arbitraries | `spatial/__fixtures__/arbitraries` | keep the fixed-point law green |

Nothing else in the engine moves. `MapInstanceState`, reveal, occupancy, `connectionFogState`, the redaction projectors' structure: unchanged.

## 4. Component & file map (apps/web)

**New — domain view vocabulary (`domain/map/view/`, new folder — the renderer vocabulary shared by the editor + dungeon surfaces; pure, aliases engine enums, importable by the kit downward and by `lib` as a peer):**

| File | Contents |
|---|---|
| `footprints.ts` | `ZoneSize` (= `MapZoneSize`), `ZONE_FOOTPRINTS`, `footprintOf`, `zoneTokenCapacity(size, clusterCount)`, `overlappingZonePairs` (D2) |
| `set-piece-view.ts` | `ZoneSetPieceView`, `SetPieceOccupant`, `ZoneMotif`/`ZoneMood` aliases (D3) |
| `threshold-geometry.ts` | `thresholdAnchors` + clamp + the stub `{side, offset}` derivation (D4, pure) |
| `threshold-state.ts` | `thresholdStateOf` — fog/hidden/locked → the four-state vocabulary (D4) |

**New — domain live-instance builders (`domain/dungeon/view/`):** `set-piece-view.ts` builders (MapZone + occupancy + roster → views; `occupancySummary`; `engagementGroup` via the existing `domain/combat/view/engagement-groups.ts`, multi-member groups only), `range-lens.ts` (the one lens-policy home, D5).

**New — canvas kit (`components/shared/canvas/`), engine-free in its own specifiers (§0 — data vocabulary imported downward from `domain/map/view`; no new allowlist entries):**

| File | Contents |
|---|---|
| `tier.ts` | `ZoneTier`, `tierOfZoom`, `MARQUEE_MAX`, midpoints, zoom constants (D1 — pure zoom math, no domain dependency) |
| `set-piece/zone-set-piece.tsx` | the tiered card over `ZoneSetPieceView` (D3) |
| `set-piece/motif-icons.tsx` | 10 motif glyphs + route glyph as `<svg>` components, keyed by `ZoneMotif` (D9) |
| `set-piece/occupant-chips.tsx` | pips / chips / token / condensed stack; owns the stop-propagation rule (D3, D7) |
| `set-piece/hop-badge.tsx` | range-lens badge (D5) |
| `set-piece/threshold-notch.tsx` | the native-button notch: state styling, counter-scaled hit pad, focus glow (D4) |
| `canvas-cartouche.tsx` | title plate (D8) |
| `hovered-connection-context.tsx` | pairing-glow channel (D4) |

**Modified — kit:** `map-canvas.tsx` (input matrix + zoom props, `data-tier` wrapper, cartouche, restyled `<MiniMap>` where hosted, new edge skin, `setZoneIdentity` dispatcher), `map-canvas-context.tsx`, `zone-node.tsx` (wrap `ZoneSetPiece`, size stepper), `connection-edge.tsx` (notch skin + explicit selection wiring), `zone-details-sheet.tsx` (three pickers), `canvas-zoom-cluster.tsx` (slider + readout + tier labels), `geometry-to-flow.ts` (footprint-aware node dimensions), `edge-flag-badge.tsx` (retire into notch labels).

**Modified — dungeon feature (`DUNGEON/_components/`):** `canvas/canvas.tsx` (tier wrapper, cartouche, minimap, click-to-center, view-builder wiring), `canvas/build-nodes.ts` + `canvas/build-edges.ts` (thin over the domain builders), `canvas/explore/zone-node.tsx`, `canvas/combat/zone-node.tsx`, `canvas/watch/zone-node.tsx` + `combat-zone-node.tsx` + `canvas.tsx` (wrap `ZoneSetPiece`; delete `exit-chip.tsx`; stub thresholds), `canvas/zone-card-frame.tsx` (retire), `canvas/explore/turn-loop-bar.tsx` (grown zoom control), `canvas/viewport-store.ts` (+ minimap-toggle entry), `explore/body.tsx` (+`inspectId`, sheet exclusivity), `combat/body.tsx` (acting-origin lens), **new** `canvas/roster-inspector.tsx`.

**Modified — lib:** the dungeon snapshot loaders (`lib/db/queries/load-dungeon-snapshot.ts` + the combat sibling) compute stub `{side, offset}` via `domain/map/view` and pass them into the projector (D4).

**Modified — ui package:** `packages/ui/src/styles/globals.css` (D6 tokens); the luminance gate test lives in apps/web (D10).

Tier/feature seams hold by construction: the kit imports only `domain/map/view` types (downward — legal, and the direction gate has no type-only carve-out, so this is the *only* legal shape); the engine-aware shaping sits in `domain/**` (un-gated); `lib` reaches the shared geometry as a domain peer; the feature canvases glue it all. `domain/map/` gets its one-line entry in the AGENTS.md repo map when created.

## 5. Success-criteria map

| PRD AC | Where it's satisfied | Where it's verified |
|---|---|---|
| 1 — 8–10-token zone reads at any footprint | D2 capacity + D7 stack/inspector | Playwright: crowded S-zone renders stack + button; inspector renders all 10 |
| 2 — five DM states distinct, non-color | D3 card classes + D6 channels | RTL state-matrix fixture (classes/attrs; D10) |
| 3 — watch stub has no partner in DOM | D4 stub path over `SnapshotExit` (+ documented `side`/`offset` scalars) | engine wire-key test (payload: exactly `{id, zoneId, locked, side, offset}`) + RTL DOM assertion (rendering) |
| 4 — footprint never moves with zoom/state | D1 derivation + D2 fixed rects | `tierOfZoom` unit + Playwright box comparison across tiers |
| 5 — correct hop badges, re-origin on select | D5 | `hopDistances` + range-lens-builder units + a Playwright re-origin check |
| 6 — e2e selector-updates only | D10 aria contract | existing suites + the two known text swaps |

## 6. Build order

The PRD's four phases hold; each ships independently. P1 is the bulk and slices cleanly in-phase:

- **P1a — vocabulary + writes:** schema fields, `setZoneIdentity` event/reducer/dispatcher (incl. null-clear round trip), arbitraries, snapshot zone passthrough, `ZoneDetailsSheet` pickers, size stepper, `domain/map/view/footprints.ts` + overlap warning, the domain view-builder skeletons. *Gate:* author size/motif/mood in the editor; old maps load untouched.
- **P1b — the tiered renderer:** `tier.ts`, the input matrix + zoom props (incl. the editor's coarse-pointer flip), `data-tier` regime, `ZoneSetPiece` + chips + motif icons over the domain builders, all four node wrappers cut over, description on DM surfaces, "Empty" dies. *Gate:* three tiers on all surfaces; state-matrix fixture green; AC 4 assertions green; **the boundary-readability browser pass at 39/41 and 109/111 settles `MARQUEE_MAX` and Stage type scale (D1)**; touch-emulation pan/select check on the editor.
- **P1c — crowded path:** cluster-aware capacity wiring (`zoneTokenCapacity(size, clusterCount)` + the two-disjoint-pairs test), condensed stack, roster inspector + `inspectId` semantics + sheet exclusivity + propagation rules. *Gate:* AC 1.
- **P2 — thresholds** (riskiest visual change, isolated): `threshold-geometry` + notch buttons + selection/keyboard wiring + state mapping + hover pairing + hit targets, editor toolbar re-anchor, `ExitChip` dissolution + `SnapshotExit` `{side, offset}` (loader-computed) + the wire-key test + the stub→reveal transition test, retire step-path skins. *Gate:* AC 3 (both halves); editor connect/toggle/delete e2e-clean; keyboard flow verified in the browser.
- **P3 — the overview layer:** occupancy overlay + reveal borders + gold keyline (replacing the legend), mood washes + luminance gate, cartouche, minimap + toggle, grown zoom control on all three bars, range lens (engine selector + domain builder + badges + origin policy). *Gate:* AC 2, AC 5.
- **P4 — watch polish + a11y:** watch bottom bar, mobile inspector drawer, aria sweep (thresholds, badges, reveal), reduced-motion sweep, hint card, e2e selector updates. *Gate:* AC 6; full suite green.

Each phase ends with the browser-verified loop (dev server, all three surfaces) per the repo habit — the canvas is DM-facing and the owner's table is the beta program.

## 7. Sizing note

No new packages, no migrations, no route changes. The riskiest line-count sits in P1b (four node cutovers + the card) and P2 (edge skin + selection re-wiring + editor interactions); both are contained by the kit owning the card/notch once and the domain builders owning the shaping once. Everything else is additive chrome or pure functions with unit tests.

## 8. Drift log & deliberate deferrals

Recorded divergences (PRD ← handoff ← code), each with the call made here:

1. **Kit engine imports:** the engine gate flags *type-only* imports too (the draft's "kit-tier legal" claim was wrong) — and the tier-direction gate flags type-only `domain → components` imports as well, which killed the intermediate "kit-owned view types" fix. Hence the final shape (§0): view vocabulary in `domain/map/view/` aliasing engine enums, kit importing downward. No new `ENGINE_IMPORT_ALLOWLIST` entries, no parallel unions, no correspondence assertions.
2. **Minimap position:** PRD says bottom-right; the prototype + all screenshots render bottom-left, and the inspector owns the right rail. **Bottom-left.** Implementation starts from RF `<MiniMap>` (custom `nodeComponent`), bespoke only on a proven fidelity gap.
3. **"No motion" non-goal vs the crossfade:** the PRD's non-goals say tier swaps are instant; the handoff specifies 300ms crossfade + 200ms camera ease. **Handoff wins** (functional continuity, not celebration); reduced-motion collapses both to instant.
4. **Overlap warning "extends":** none exists today — `overlappingZonePairs` is net-new (D2).
5. **Cartouche theme line:** no data source under the PRD's schema boundary; DM/editor subtitle is "N zones", the watch omits the count (revealed-only payload — a count would lie or leak). A future optional `theme` column (or Procedural Dungeons' Region naming) fills the designed slot.
6. **Range-lens semantics:** hops measure **authored adjacency** (rules §3.5: adjacency is a DM ruling; the authored connection *is* that ruling — a truly separating locked door is authored as no connection). Locked/secret connections therefore count on DM surfaces. If the table rules locked doors shouldn't carry range, the flip is one filter in `range-lens.ts` — the single policy home.
7. **Stub `side` + `offset` scalars:** `SnapshotExit` deliberately discloses where on the wall an unexplored exit sits (position stability across reveal + honest fiction beat perfect direction-hiding — the wall alone wasn't enough, since revealed notches sit at the overlap midpoint); it still carries no partner id/name/geometry. The values are loader-computed through the same geometry as the revealed renderer, so the engine stays footprint-blind and stability holds by construction. AC 3's wire-key + transition tests pin exactly this boundary.
8. **Marquee/Stage boundary:** the handoff's 40% boundary makes Stage type *smaller* than Marquee type at the crossover; `MARQUEE_MAX` + Stage type scale are explicit calibration knobs settled by P1b's browser pass (39/41, 109/111). **Settled (P1b):** `MARQUEE_MAX` stays **40**, and the inversion is removed at its source — the Stage header name is sized to match the Marquee name (both `text-lg`), so on-screen name size increases monotonically with zoom and never shrinks crossing the boundary. (Constants live in `components/shared/canvas/tier.ts` + the Stage layer of `set-piece/zone-set-piece.tsx`.)
9. **Motif set closed** at the handoff's 10; extension = enum member + icon PR.
10. **Boss token emphasis** (`avaB` in the handoff) deferred — no boss concept exists on the roster shapes; hostiles render uniformly until one does.
11. **Constellation hairline** stays in reserve, unbuilt (PRD).
12. **Watch re-origin** deferred — the watch has no selection; the lens is party-origin only there.
13. **Prototype's focus-locked camera** not adopted — free pan survives; click-to-center is additive (interaction #17).
14. **Editor touch is a config fork, not a free lunch:** React Flow's `selectionOnDrag` captures the primary touch pointer and `panOnDrag={[1]}` has no touch equivalent, so the editor flips to pan-first on coarse pointers (D1) — verified under touch emulation, not assumed.
