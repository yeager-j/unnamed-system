# Dungeon & Maps Visual Overhaul — PRD

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here. Drafted in a design session 2026-07-14; reconciled against the high-fidelity design handoff 2026-07-15.

**Status:** Draft · **Owner:** Jackson · **Scope boundary:** this is a **visual/UX overhaul only** — the spatial substrate (Map geometry, MapInstance, reveal model, occupancy, the React Flow canvas architecture) is explicitly out of scope for change. Three additive optional fields land on `MapZone`; nothing else about the data model moves. The **mapless encounter console is untouched**. The next major feature, [Procedural Dungeons](../procedural-dungeons/PRD.md), ships after this overhaul and constrains several decisions below (noted inline).

> **Design handoff.** A high-fidelity, interactive design reference for the **DM Explore console** lives at `Showtime/artifacts/dungeons-redesign/design_handoff_dungeon_maps/` (README + `.dc.html` prototypes; treat the HTML as the source of truth for layout/measurement/color/interaction, *not* architecture — recreate in the app's own React/Tailwind/shadcn stack). It finalized the specifics this PRD had left open (tier zoom bands, the equal-luminance wash constraint, the always-on range lens, the restored motif glyph set) and added one mechanism the PRD did not have: the **roster inspector** for crowded zones (§1). The handoff covers Explore mode; the same vocabulary extends to Combat, the player watch, and the map editor per this PRD.

> **Prior context.** The load-bearing existing pieces, one line each:
>
> - **Map / MapInstance / Dungeon row / reveal fog** — as defined in the [Procedural Dungeons PRD](../procedural-dungeons/PRD.md) prior-context block; unchanged here.
> - **Zone rules** (rulebook §3.5) — a Zone is ~30 ft of battlefield, DM-flexed; **adjacency** means "a character can travel from one to the other without crossing a third Zone"; within a Zone, position is theater of the mind; Range is measured in Zone hops (Engaged / Same Zone / Adjacent / "up to 2 Zones away").
> - **The canvas today** — every zone renders as an identical ~344px card (name + occupant count + token chips, or the literal word "Empty"); connections render as routed orthogonal step-paths between cards; four zone-node variants (template editor, DM explore, DM combat, player watch) share this language.
> - **Brand guide** ([docs/brand/brand-guide.md](../brand/brand-guide.md)) — "mystical theater": near-black stage, indigo hero, rationed gold, DM Serif Display for marquee only, elevation by tone not shadow, motion reserved; *branded chrome, calm core*.
> - **Non-color doctrine** — all fog/flag state is encoded by glyph + text + aria-label, never color alone. Preserved throughout.

## Overview

The dungeon map works mechanically but fails experientially, in two specific ways observed at the table:

1. **No sense of place or scale.** Every zone is an identical gray rectangle in a void. A grand cathedral nave and a cramped alcove render pixel-identically. The dungeon never reads as a coherent *somewhere*. (The abstraction of *what happens inside* a Zone is by design — theater of the mind governs within-zone action. The abstraction was never supposed to make the map itself placeless.)
2. **Edge connectors are misread as geography.** The routed, right-angled connection lines read as blueprint corridors. Players concluded zones are rooms and lines are hallways. They are not: adjacency is abstract — the "place" between your living room and bedroom is a Loki's Wager, not a location. The renderer draws the thing the rules say doesn't exist.

Compounding both: **zone content density**. A 4v4 fight is 8 tokens minimum in one zone, before features, exits, and (soon) procedural contents manifests. A card that grows to fit collides with neighbors; a card that doesn't is unreadable.

The overhaul's governing insight comes from the brand: the app is a **mystical theater**, and in a theater the space between stages is *offstage* — nobody asks what the hallway between two sets looks like, because there isn't one. Zones become **set pieces on a dark stage**; adjacency renders as **thresholds on the zone's rim**; the void between stays void; and detail is a function of **zoom, and only zoom**.

The visual vocabulary this PRD defines (thresholds, zoom tiers, reveal/occupancy channels, gold semantics) is deliberately **renderer-agnostic**: a future second renderer (see *Future: Illustrated Maps*) reuses it wholesale over uploaded artwork.

## Goals

- Give every zone an authorable **visual identity** — footprint size, motif, mood — cheap enough to author in seconds, so an empty zone conveys place instead of the word "Empty".
- Replace connection lines with **rim thresholds** so adjacency reads as "this stage has an exit toward the Nave," never as a corridor.
- Solve token/content density with **semantic zoom**: three hard detail tiers over fixed zone footprints, so an 8-token brawl is glanceable zoomed out and fully detailed zoomed in, and cards can never overlap.
- Make the floor read as a **coherent, named place**: occupancy-driven luminance, a title cartouche, a branded minimap.
- Serve the DM's real spatial question — *"who can this Skill reach?"* — directly, via a **range lens** (hop-distance badges), rather than asking them to eyeball a line graph.
- Keep **one visual vocabulary across all three surfaces** — DM console (explore + combat), player watch, and map template editor — differing only by redaction and interactivity.
- Land everything **forward-compatible with Procedural Dungeons**: stubs, portal chips, contents manifests, and template-stamped identity all have designed homes.

## Non-Goals

- **No images, tiles, or VTT-style maps** in this overhaul. The abstract doctrine holds; this PRD is the argument that abstraction can still feel like *somewhere*. (Illustrated Maps is future work — see the final section — and changes the renderer, not the substrate.)
- **No spotlight / active-zone state.** Detail level derives from zoom level, never from selection, turn state, or any other app state. (Considered and rejected: an auto-expanding "active" zone. Zoom needs no new state and matches how physical minis work — you lean in.)
- **No drawn connection lines at any zoom tier.** The one exception: the in-editor drag preview while creating a connection, which disappears when the connection lands. (A "constellation hairline" fallback is held in reserve — see *Resolved Questions* — but is not shipped until the void-only design fails at a real table.)
- **No districts / visual grouping layer.** Procedural Dungeons' *pages* will partition space at that granularity and its *Region* object owns the adjacent naming; a third grouping concept now would collide with both.
- **No mechanical meaning for zone size.** S/M/L/XL is visual vocabulary only; a Zone is one Zone for movement, range, and AOE regardless of footprint.
- **No freeform tags.** The `mood` enum covers the visual need; grammar tags belong to Procedural Dungeons' template schema.
- **No mapless encounter console changes.**
- **No schema restructure.** Three additive optional fields on `MapZone` (`size`, `motif`, `mood`); existing maps load unchanged with defaults (`M` / none / `dim`). No migrations.
- **No motion.** Tier changes swap content instantly; per the brand guide, the working canvas is static, and animation stays reserved for rare celebratory beats.

## Users & Context

The primary user is the **DM** running the dungeon console live. The secondary audience is **players**, each on their own device viewing the watch URL (established table setup — not a shared TV), so the watch can rely on personal pan/zoom and small interactive detail. The tertiary surface is the **map template editor**, used during prep; it renders the same nodes and inherits the overhaul automatically.

## The Design

### 1. Foundations: two governing rules

**Rule 1 — The void is offstage.** Nothing between zones is ever geography. No routed lines, no paths, no implied corridors. Adjacency renders on the zone's rim as a threshold marker. The dotted starfield background stops being dead space behind a diagram and becomes the point: the dark of the theater between lit stages.

**Rule 2 — Detail is a function of zoom, and only zoom.** Every zone lives at a fixed rectangle in an abstract **world** coordinate space; its footprint never changes with zoom, selection, or turn state, so cards structurally cannot grow into a neighbor. A single camera transform maps world → screen from one `zoom` value. What changes is what renders *inside* the footprint. Zooming in buys screen pixels per world unit, and the renderer spends them:

| Tier | Zoom band | Zone renders | Occupants render |
|---|---|---|---|
| **Marquee** | `< 40%` | motif glyph (large) + name + occupancy pips | faction-tinted count pips only |
| **Stage** | `40–110%` | + one-line description, hop badge, dm-notes glyph, threshold labels on hover | occupancy summary line + small faction avatar chips; no names |
| **Closeup** | `> 110%` | + fuller description, threshold labels, contents-manifest slot | full tokens (portrait, name, HP/SP) — **or** a condensed stack + roster inspector when the footprint can't hold them (see *Crowded zones* below) |

Three tiers, **hard breakpoints** on the single `zoom` value (range 20–160; wheel and slider both write it; tier-label shortcuts animate `zoom` to a band midpoint). Content swaps at the breakpoint via a crossfade — each zone renders all three density layers stacked, and the active one fades in; no layout reflow. Thresholds render at every tier (they are structure, not detail). Tier is a pure derivation from `zoom` — never stored, never settable independently, structurally incapable of disagreeing with the camera.

The DM's flow: live at Stage to run the room; pinch out to Marquee for "how big is this place, what's two hops away"; pinch into Closeup when the fight gets thick — and for any one zone, open its roster inspector to read a full 8–10-token combat without zooming the whole map. The accepted trade at Closeup (fewer zones on screen at once) is real but no longer forces a choice between full token detail and the battlefield read, because the inspector decouples the two.

### Crowded zones: the roster is decoupled from the footprint

A token's size is fixed in *screen* space; a zone's footprint is fixed in *world* space. So a small room physically cannot grow enough token slots for a 4v4 by zooming — the zone rectangle means **position + adjacency only**, never roster capacity. The Closeup rule is two-part:

- **Per-zone capacity** is derived from the footprint (a two-column token grid: `cap = max(1, floor((h − 64) / 46)) × 2`). If the roster fits capacity, full tokens render in-card — the common authored case, since set-piece encounters are authored into rooms sized to hold them.
- **If it doesn't fit**, the card degrades to a **condensed avatar stack** (up to ~6 overlapping avatars + `+N`) with an always-visible **"Open roster ▸"** button. Tokens are never clipped.

**The roster inspector holds the truth.** Clicking a crowded zone (or "Open roster", or any occupied zone) docks a **roster inspector sheet** that budgets space by *combatant count, not room size*, so 8–10 tokens read cleanly regardless of footprint. It is a distinct piece of state (`inspectId`, nullable) **independent of camera focus** (`focusId`) — inspecting a zone does not move the camera, and closing the sheet (or selecting elsewhere) clears it. This is the recommended mechanism for the "~8–10 tokens in one zone" acceptance criterion: authoring keeps big encounters in big chambers; the inspector is the graceful fallback so room size is never a hard cap.

### 2. The zone card as a set piece

**Three new authored fields on `MapZone`** — all optional, all defaulted, all designed to be stampable by Procedural Dungeons' zone templates later, so generated zones arrive with visual identity rather than gray defaults:

| Field | Values | Effect |
|---|---|---|
| `size` | S / M / L / XL (default M) | Fixed canvas footprint — alcove / room / hall / cathedral-nave. Default M renders close to today's card so existing maps don't reflow badly. Footprint is also an input to Procedural Dungeons' auto-layout heuristics. |
| `motif` | one of a curated glyph set (handoff ships 10 — water, stair, bones, statue, altar, treasure, crates, cell, mechanism, tomb; whether it stays a closed enum or becomes author-extensible is an implementation call) | The zone's glyph identity, rendered at every tier; at Marquee it *is* the zone alongside the name. |
| `mood` | `warm` / `dim` / `cool` (default `dim`) | A restrained light wash mixed into the card surface. **Hard constraint: all washes share a fixed luminance (L ≈ 0.62) and mix ratio — only hue varies**, so occupancy stays the *only* channel that moves brightness (see §4). A fixed enum, not freeform: the distinction is decided once and every renderer downstream stays blind to it. The three-hue set is the shipped baseline; more hues may be added later provided the equal-luminance rule holds. |

**No new description field.** The existing player-facing `description` finally renders on DM surfaces: one line clamped at Stage, fuller at Closeup, complete in the details sheet. (Today it renders only on the watch and in the edit sheet — the DM console never shows it.)

**"Empty" dies.** An empty zone shows its identity — icon, name, description, light — not an apology. An empty zone with a good descriptor *is* the sense of place; the current design literally replaces atmosphere with the word "Empty".

**Reserved manifest slot.** The Closeup tier reserves a card region for Procedural Dungeons' DM-only contents manifest (enemy rows, loot, flavor, one-click staging), and the Stage-tier occupancy summary line is the natural home for a one-line contents teaser ("Sealed cache", "Boss") once that feature lands. Both ship empty-but-designed so the feature has a home waiting.

**Typography discipline:** zone names stay Hanken Grotesk (working data). DM Serif Display is spent only at the floor level (the cartouche, §4), per the brand guide's rationing.

### 3. Thresholds: adjacency without lines

**Anatomy.** A connection renders as a **paired notch** — a small gap cut into each of the two zones' facing walls, aligned on their shared overlap band and filled with the offstage void color so it reads as an opening in the wall, with short jamb segments for the doorframe. Placement per pair: if the two zones are separated more horizontally than vertically, notches sit on the left/right facing edges at the vertical midpoint of their overlap, else on the top/bottom edges at the horizontal midpoint. Notches are **neutral rim hardware** (muted color) — never gold, never a floating midpoint marker. Between the two notches: nothing.

**Pairing legibility.** Orientation and placement carry the pairing — a threshold physically faces its partner. Hovering or selecting a threshold lights its twin and the partner card; no tether is drawn even on hover. At Closeup thresholds carry the partner's name ("⇢ The Nave"); at Stage on hover; at Marquee, bare markers.

**The range lens.** Killing lines makes eyeball hop-counting harder; the answer is to serve the underlying question directly. Every zone badges its **hop distance** from an origin (1, 2, 3, …), the badge de-emphasizing with distance — a pure BFS over connections, unit-tested in the domain layer, using a distinct "route" glyph register so a hop badge never reads as an occupancy count. The lens is **always on**: the origin defaults to the party's zone, and selecting any zone re-origins it. This answers "who can Maragion reach from here?" better than any line graph, and supplies the *distance* half of sense-of-scale.

**State vocabulary.** Connection state lives on the connection, not the zone (four states); the dash/dot pattern carries each state as a non-color channel, per the doctrine:

| State | Notch renders |
|---|---|
| Open | plain notch pair |
| Locked | notch pair + padlock glyph |
| Secret (DM-only) | dashed notch; the zone beyond is typically unmapped |
| Unmapped | dotted notch at reduced opacity — leads somewhere uncharted |

The **Unmapped** row is load-bearing for Procedural Dungeons. On the DM surfaces it renders as a dotted notch with its partner visible; on the **watch**, structural redaction removes the partner entirely, so it renders as a lone notch opening into darkness — the silhouette stub, verbatim. A generated stub renders through this identical path, satisfying that PRD's indistinguishability requirement (its success criterion 3) **by construction** — one render path, so there is no second path to distinguish. Their cross-page portal chip ("leads to Castle ⇢") is likewise just a threshold whose label names a page — that PRD independently specified "not a drawn line."

The watch's current `ExitChip` footer row dissolves into rim thresholds — exits live on the rim on every surface, one vocabulary.

**Editor interactions carry over:** drag from a rim handle to connect (the drag preview is the only line that ever renders, gone when the connection lands); select either marker to select the connection; toolbar toggles for hidden/locked/delete.

### 4. The overview layer

**Occupancy → fill; reveal → border.** Two orthogonal facts, two channels, never shared:

- **Fill (occupancy), binary:** occupied zones get a single uniform lit overlay; empty zones stay flat (their mood wash still tints them). The overlay is **identical for 1 occupant or 5** — luminance never encodes count; the pips/chips/tokens say *who* and *how many*. Zoomed to Marquee, the floor reads as a dark theater with lit stages where the actors are.
- **Border (reveal, DM surfaces), two states:** `revealed` = solid border; `unmapped` = **dashed border + interior dimmed** — the same dash vocabulary as secret thresholds, one rule: *dashed = players haven't mapped this yet*. Exactly two zone reveal states; the secret-vs-uncharted distinction is a property of the *connection*, not a third zone state (§3). Luminance never participates in reveal.

The composed state matrix (each cell also glyph/token-disambiguated, nothing rests on brightness perception alone):

| | Revealed (solid border) | Unmapped (dashed border + dimmed) |
|---|---|---|
| **Empty** | flat fill | flat fill, dimmed |
| **Non-party occupants** | lit fill, red pips | lit fill, red pips, dimmed |
| **Party present** | lit fill + gold keyline | *(practically unreachable — party movement maps the zone)* |

An unmapped zone the DM has pre-staged with enemies renders *lit but dashed* — loaded, but the audience doesn't know yet — exactly the dramatic state it represents.

**Gold semantics.** The brand's rationed gold is spent on one meaning at every tier and surface: *the player's stake*. The party's zone earns a thin gold keyline; on the watch, the viewer's own token keeps its existing gold tint.

**The cartouche.** An on-canvas title plate, pinned **top-center** like a playbill header: dungeon name in DM Serif Display flanked by gold hairline flourishes, with an uppercase theme + zone-count subtitle beneath ("Tide-drowned temple · 16 zones"). **Timeless identity only — no live state.** Turn counter and tier readout live in the working bar, never here; the one place the display face appears on the canvas.

**The working bar** (bottom-center). Play/Edit segmented control, turn counter, and the **zoom control**: `−` / range slider / `+` plus a `NN% · <Tier> tier` readout, with Marquee/Stage/Closeup labels acting as zoom shortcuts (each animates `zoom` to its band midpoint) that highlight the *derived* tier. The tier labels are a shortcut and a readout, never an independent selector.

**The minimap** (bottom-right). A scaled plan of all zones — party gold, occupied lit, unmapped dashed — with a gold camera-frame rectangle tracking the viewport live. On by default in the DM console, toggleable; off by default on the watch.

**Editor consequences.** The zone details sheet gains the three pickers (size / motif / mood); the node toolbar gains a compact size stepper. Size changes re-snap the footprint to the grid; the existing overlap warning extends to footprint collisions introduced by resizing. The settings panel's "N zones · M connections" line stays. (Note the console now has *two* right-hand sheets serving different jobs: the **roster inspector** — read-only, docks on any occupied zone, §1 — and the **details sheet** — authoring, opened from the toolbar. They must not be conflated.)

### 5. The watch

The watch changes least, by design: same cards, tiers, thresholds, and gold semantics, with the existing **structural redaction** doing the work — unmapped zones and secret connections never reach the payload, so that vocabulary has nothing to render player-side. Players see revealed set pieces with their mood wash and description, stubs opening into darkness at unexplored exits, and engagement clusters. No minimap by default, no dm-notes glyph, no manifest slot. Players drive their own zoom tiers on their own devices — the density solution, including the roster inspector for a crowded zone, is identically theirs.

Combat mode keeps its current vocabulary intact inside the new cards: engagement framing, acting ring, enchantment badge as title accessory, turn bar — re-homed onto tiered set pieces, not redesigned.

## Success Criteria

1. A 4v4 fight (8–10 tokens) in one zone reads cleanly **regardless of the zone's footprint**: at Stage tier the zone shows a truthful occupancy summary; at Closeup a well-sized room shows full tokens and a small room degrades to a condensed stack + "Open roster ▸"; the roster inspector always renders every combatant without clipping.
2. All five reachable DM zone states render as distinct border × fill combinations, verified in a storybook-style fixture, non-color-encoded (each also glyph/token-disambiguated).
3. A stub (unmapped connection) on the watch renders with **no partner information in the DOM** — structural, testable, forward-compatible with Procedural Dungeons' indistinguishability gate.
4. Zone footprint never changes from zoom, selection, or turn state — asserted in the canvas layer; tier is always the pure function of `zoom`, never independently settable.
5. The range lens shows correct hop badges from the party origin and re-origins on selection (pure BFS, unit-tested in the domain layer).
6. Existing e2e suites pass with selector updates only — no flow changes.

## Rollout Shape

Tickets to be filed after this PRD is accepted; each phase ships independently (the canvas is DM-facing and the owner's table is the beta program):

- **P1** — the tiered zone card: three authored fields + defaults, the camera/tier renderer (world-space rects, crossfade layers), description on DM surfaces, editor pickers, and the crowded-zone path (capacity derivation, condensed stack, roster inspector).
- **P2** — thresholds replacing edges (the riskiest visual change, isolated): notch pairs + placement, pairing glow, state vocabulary, `ExitChip` dissolution, editor connect flow.
- **P3** — the overview layer: occupancy luminance + reveal border channel, gold keyline, cartouche, minimap, the zoom working bar, range lens.
- **P4** — watch polish, a11y pass, the state-matrix fixture suite.

## Resolved Questions

Decisions from the 2026-07-14 design session, plus specifics finalized in the 2026-07-15 design handoff:

- **Approach: set pieces on a dark stage** — restyle in place over the node-graph. Considered and rejected: **abutting territory polygons** (strongest physicality, but raises geographic literalism, breaks the freeform editor, hardest token layout — wrong direction for a theater-of-the-mind game) and **overview-canvas + detail rail** (cheapest, but dodges sense-of-place and weakens the at-a-glance battlefield read).
- **Density: zoom only, no spotlight.** An "active zone renders expanded" mechanic was considered and rejected — detail view comes from zoom level, not app state.
- **Crowded zones → roster inspector (handoff).** The zone rect is position + adjacency only; the roster is decoupled from the footprint. Closeup renders full tokens when they fit the derived capacity, else a condensed stack + "Open roster ▸"; a docked inspector sheet (`inspectId`, independent of camera `focusId`) holds the full roster budgeted by combatant count. This is the answer to the 8–10-token AC — superseding the earlier "you just see fewer zones at Closeup" framing.
- **Tier bands finalized (handoff):** `zoom` range 20–160; Marquee `<40`, Stage `40–110`, Closeup `>110`; all three density layers render stacked and crossfade on tier change; tier labels are zoom shortcuts, never independent selectors.
- **Mood = three equal-luminance washes (handoff):** `warm`/`dim`/`cool` at a fixed L ≈ 0.62, hue-only — occupancy stays the sole brightness channel. (Was "~6 named stage lights"; the hard constraint is equal luminance, not the hue count.)
- **Motif restored (handoff):** dropped in an intermediate draft, reinstated as a 10-glyph set rendered at every tier; closed-enum vs. author-extensible is an implementation call.
- **Range lens: always-on, party-origin (handoff):** hop badges are always shown from the party's zone and re-origin on selection, using a distinct "route" glyph so they never read as counts. (Was an open "always-on vs. explicit mode" question.)
- **Cartouche: top-center, identity-only (handoff):** moved from top-left; carries name + theme + zone count and never live state (turn/tier live in the working bar).
- **Fixed footprints.** Card canvas footprint is a function of authored size alone; semantic zoom renders more inside the same bounds. This kills the card-growth/overlap problem structurally.
- **No lines, with a recorded fallback.** Shipping with zero connection lines at every tier. If real-table use shows threshold pairing is ambiguous on dense maps, the reserve design is a **Marquee-only dotted "constellation" hairline** — straight, faint, star-chart not corridor. Not built until needed.
- **Channel separation for the six-state problem.** Occupancy rides fill luminance; reveal rides border style + glyph; the party rides the gold keyline. Raised as a direct critique ("can brightness distinguish six states?" — no, and it shouldn't try).
- **Districts cut.** Procedural Dungeons' pages + Region cover the grouping/naming need; no third concept.
- **`description` reused, no subtitle field.** Clamped by tier instead of adding a field.
- **Naming:** "Region" is reserved by Procedural Dungeons; this PRD introduces no competing grouping term.
- **Illustrated Maps deferred to its own PRD** (see below) — raised mid-session as a possible 180, resolved as a second renderer over the same substrate, not a redirection of this overhaul.

## Open Questions (for the technical design)

The handoff settled the tier bands, wash palette/luminance, range-lens interaction, cartouche placement, and the Closeup token-grid/capacity math (see *Resolved Questions*). Still open:

- **Footprint dimensions** — concrete S/M/L/XL world-unit rects and their grid/snap relationship (the handoff sample uses arbitrary per-zone rects; the authored `size` enum needs a fixed mapping).
- **Motif set** — closed enum vs. author-extensible, and the final glyph list beyond the handoff's 10.
- **Threshold hit-targets** — rim notches are smaller than full edges; pointer/touch target sizing and the hover-glow disambiguation need care, especially where partners sit far apart across the void.
- **Range lens + combat** — how the always-on lens composes with combat's existing move-target highlighting without channel collision.
- **Engagement clusters in Combat** — the dashed-red grouped sub-container the handoff notes for Combat mode: how it arranges within a footprint and interacts with the crowded-zone degradation.

## Future: Illustrated Maps (not this PRD)

Captured from the same design session, so the thinking doesn't evaporate:

**The idea.** Traditional tabletop cartography is beautiful and communicates place/scale better than any abstraction — but it carries the 5-ft grid with it. Strip the grid, keep the picture: upload a map image and **trace Zones onto it with a rectangle tool**. Adjacency, reveal, occupancy, and every existing mechanic ride the same substrate; fog of war unmasks the artwork zone by zone. Lineage: the FATE-style *zone map* — regions drawn over an illustration, rules in the regions, fiction in the art.

**Why it's a second renderer, not a replacement.** Procedural Dungeons generates space just-in-time — generated zones have no artwork by construction, and the motivating campaign (Drakkenheim) lives mostly in generated space. So illustrated maps are a **mode for authored static maps**, coexisting with abstract set pieces. The natural seam is Procedural Dungeons' **pages**: a page gains an optional backdrop; the hand-drawn castle page is illustrated, the generated city pages are abstract. A portal threshold from painted castle to abstract streets is honest fiction.

**What transfers wholesale** (why this PRD's vocabulary is renderer-agnostic): thresholds become door pins placed on the artwork's painted doorways (adjacency still needs authoring — abutting rects across a painted wall must not read as adjacent); reveal becomes fog masking over art; occupancy luminance becomes literal lit rooms; zoom tiers still gate token detail; the channel matrix carries unchanged.

**Known hard edges for that PRD:** token density gets *worse* over art (rects are whatever the cartographer painted; tokens need a scrim and must **auto-arrange in a disciplined cluster, never free pixel placement** — free placement over art quietly rebuilds a gridless VTT and reintroduces position litigation); upload pipeline + tracing editor + masking renderer is a bigger build than this entire overhaul; rect-only tracing is the right v1 fence.
