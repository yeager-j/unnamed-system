# Dungeon & Maps Visual Overhaul — PRD

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here. Drafted in a design session 2026-07-14.

**Status:** Draft · **Owner:** Jackson · **Scope boundary:** this is a **visual/UX overhaul only** — the spatial substrate (Map geometry, MapInstance, reveal model, occupancy, the React Flow canvas architecture) is explicitly out of scope for change. Three additive optional fields land on `MapZone`; nothing else about the data model moves. The **mapless encounter console is untouched**. The next major feature, [Procedural Dungeons](../procedural-dungeons/PRD.md), ships after this overhaul and constrains several decisions below (noted inline).

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
- **No freeform tags.** The `light` enum covers the visual need; grammar tags belong to Procedural Dungeons' template schema.
- **No mapless encounter console changes.**
- **No schema restructure.** Three additive optional fields on `MapZone` (`size`, `motif`, `light`); existing maps load unchanged with defaults (M / none / `unlit`). No migrations.
- **No motion.** Tier changes swap content instantly; per the brand guide, the working canvas is static, and animation stays reserved for rare celebratory beats.

## Users & Context

The primary user is the **DM** running the dungeon console live. The secondary audience is **players**, each on their own device viewing the watch URL (established table setup — not a shared TV), so the watch can rely on personal pan/zoom and small interactive detail. The tertiary surface is the **map template editor**, used during prep; it renders the same nodes and inherits the overhaul automatically.

## The Design

### 1. Foundations: two governing rules

**Rule 1 — The void is offstage.** Nothing between zones is ever geography. No routed lines, no paths, no implied corridors. Adjacency renders on the zone's rim as a threshold marker. The dotted starfield background stops being dead space behind a diagram and becomes the point: the dark of the theater between lit stages.

**Rule 2 — Detail is a function of zoom, and only zoom.** Every zone has a **fixed canvas footprint** set by its authored size. The footprint never changes with zoom, selection, or turn state, so cards structurally cannot grow into a neighbor. What changes is what renders *inside* the footprint. Zooming in buys screen pixels per canvas unit, and the renderer spends them:

| Tier | Roughly | Zone renders | Tokens render |
|---|---|---|---|
| **Marquee** | zoomed way out | name + motif icon + occupancy pips | side-tinted count pips only |
| **Stage** | default working zoom | + one-line description, threshold labels on hover, dm-notes glyph | glyph clusters — engaged tokens touching inside a hairline frame, free tokens spaced; no names |
| **Closeup** | zoomed in | + fuller description, threshold labels, contents-manifest slot | full chips: portrait, name, vitals, engagement framing |

Three tiers, **hard breakpoints** — content swaps at a zoom threshold, instantly, no morphing. Thresholds render at every tier (they are structure, not detail). Tier selection is a pure derivation from React Flow's zoom value — no new state anywhere.

The DM's flow: live at Stage to run the room; pinch out to Marquee for "how big is this place, what's two hops away"; pinch into Closeup when the fight gets thick. The accepted trade: at Closeup you see fewer zones at once — full token detail and whole-battlefield never coexist, which is how a physical table works too.

### 2. The zone card as a set piece

**Three new authored fields on `MapZone`** — all optional, all defaulted, all designed to be stampable by Procedural Dungeons' zone templates later, so generated zones arrive with visual identity rather than gray defaults:

| Field | Values | Effect |
|---|---|---|
| `size` | S / M / L / XL (default M) | Fixed canvas footprint — alcove / room / hall / cathedral-nave. Default M renders close to today's card so existing maps don't reflow badly. Footprint is also an input to Procedural Dungeons' auto-layout heuristics. |
| `motif` | one of a curated ~24-icon Phosphor set (arch, stairs, altar, water, trees, skull, chest, flame, gate, …) | The zone's glyph identity; at Marquee it *is* the zone alongside the name. |
| `light` | one of ~6 named stage lights (working set: *moonlit / ember / sunken / verdant / arcane / unlit*; tuned during build) | A restrained mood wash — hue-shifted card surface + icon color, nothing saturated. A fixed enum, not freeform: the distinction is decided once and every renderer downstream stays blind to it. |

**No new description field.** The existing player-facing `description` finally renders on DM surfaces: one line clamped at Stage, fuller at Closeup, complete in the details sheet. (Today it renders only on the watch and in the edit sheet — the DM console never shows it.)

**"Empty" dies.** An empty zone shows its identity — icon, name, description, light — not an apology. An empty zone with a good descriptor *is* the sense of place; the current design literally replaces atmosphere with the word "Empty".

**Reserved manifest slot.** The Closeup tier reserves a card region for Procedural Dungeons' DM-only contents manifest (enemy rows, loot, flavor, one-click staging). It ships empty-but-designed so that feature has a home waiting.

**Typography discipline:** zone names stay Hanken Grotesk (working data). DM Serif Display is spent only at the floor level (the cartouche, §4), per the brand guide's rationing.

### 3. Thresholds: adjacency without lines

**Anatomy.** A connection renders as a **paired threshold marker** — one on each zone's rim, at the point facing its partner (the existing floating-edge border math computes exactly this point; the math survives, the path dies). A marker is an arch/gap notch set into the card border — the border visibly opens, a doorway cut in the set wall. Between the two markers: nothing.

**Pairing legibility.** Orientation and placement carry the pairing — a threshold physically faces its partner. Hovering or selecting a threshold lights its twin and the partner card; no tether is drawn even on hover. At Closeup thresholds carry the partner's name ("⇢ The Nave"); at Stage on hover; at Marquee, bare markers.

**The range lens.** Killing lines makes eyeball hop-counting harder; the answer is to serve the underlying question directly. **Selecting a zone badges every other zone with its hop distance** (1, 2, 3, …) — a pure BFS over connections, unit-tested in the domain layer. This answers "who can Maragion reach from here?" better than any line graph, and supplies the *distance* half of sense-of-scale.

**State vocabulary** (glyph + text + aria on every state, per the non-color doctrine):

| State | Threshold renders |
|---|---|
| Open | solid notch, border gap |
| Locked | notch + lock glyph, heavier stroke |
| Secret (DM surfaces only) | dashed notch + eye-slash glyph |
| Undiscovered (watch) | **the stub**: a notch opening into painted darkness — no partner marker, no partner zone |
| Undiscovered (DM) | dotted notch + footprints glyph, partner visible |

The fourth row is load-bearing for Procedural Dungeons: the watch's undiscovered connection *is* the silhouette stub, verbatim. A generated stub renders through this identical path, satisfying that PRD's indistinguishability requirement (its success criterion 3) **by construction** — one render path, so there is no second path to distinguish. Their cross-page portal chip ("leads to Castle ⇢") is likewise just a threshold whose label names a page — that PRD independently specified "not a drawn line."

The watch's current `ExitChip` footer row dissolves into rim thresholds — exits live on the rim on every surface, one vocabulary.

**Editor interactions carry over:** drag from a rim handle to connect (the drag preview is the only line that ever renders, gone when the connection lands); select either marker to select the connection; toolbar toggles for hidden/locked/delete.

### 4. The overview layer

**Occupancy → fill; reveal → border.** Two orthogonal facts, two channels, never shared:

- **Fill (occupancy):** empty zones render a step dimmer into the stage black (their light wash still tints them); occupied zones render at full brightness, with tokens/pips saying *who*. Zoomed to Marquee, the floor reads as a dark theater with lit stages where the actors are.
- **Border (reveal, DM surfaces):** hidden-from-players zones swap the muted-background treatment for a **dashed card border + eye-slash badge** — deliberately the same dash vocabulary as secret thresholds, one rule: *dashed = players can't see this yet*. Luminance never participates in reveal.

The composed state matrix (every cell also glyph/token-disambiguated, nothing rests on brightness perception alone):

| | Revealed (solid border) | Hidden (dashed border + eye-slash) |
|---|---|---|
| **Empty** | dim fill | dim fill |
| **Non-party occupants** | lit fill, red pips | lit fill, red pips |
| **Party present** | lit fill + gold keyline | *(practically unreachable — party movement reveals)* |

A hidden zone pre-staged with enemies renders *lit but dashed* — loaded, but the audience doesn't know yet — exactly the dramatic state it represents.

**Gold semantics.** The brand's rationed gold is spent on one meaning at every tier and surface: *the player's stake*. The party's zone earns a thin gold keyline; on the watch, the viewer's own token keeps its existing gold tint.

**The cartouche.** An on-canvas title plate, pinned top-left like a star-chart's cartouche: dungeon name in DM Serif Display, a small celestial flourish, zone count in mono beneath. The one place the display face appears on the canvas; the cheap half of "this is a coherent place with a name."

**The minimap.** React Flow's built-in MiniMap restyled to brand: near-black field, zone footprints as light-washed rectangles (size and mood survive miniaturization), gold fleck for the party zone, indigo viewport rectangle. On by default in the DM console, toggleable; off by default on the watch.

**Editor consequences.** The details sheet gains the three pickers (size / motif / light); the node toolbar gains a compact size stepper. Size changes re-snap the footprint to the grid; the existing overlap warning extends to footprint collisions introduced by resizing. The settings panel's "N zones · M connections" line stays.

### 5. The watch

The watch changes least, by design: same cards, tiers, thresholds, and gold semantics, with the existing **structural redaction** doing the work — hidden and undiscovered content never reaches the payload, so the dashed/secret vocabulary has nothing to render player-side. Players see revealed set pieces with their light and description, stubs opening into darkness at unexplored exits, and engagement clusters. No minimap by default, no dm-notes glyph, no manifest slot. Players drive their own zoom tiers on their own devices — the density solution is identically theirs.

Combat mode keeps its current vocabulary intact inside the new cards: engagement framing, acting ring, enchantment badge as title accessory, turn bar — re-homed onto tiered set pieces, not redesigned.

## Success Criteria

1. A 4v4 fight in one zone is readable at Stage tier — two engagement clusters, sides distinguishable — without opening anything.
2. All five reachable DM zone states render as distinct border × fill × badge combinations, verified in a storybook-style fixture, non-color-encoded.
3. A stub (undiscovered connection) on the watch renders with **no partner information in the DOM** — structural, testable, forward-compatible with Procedural Dungeons' indistinguishability gate.
4. Zone footprint never changes from zoom, selection, or turn state — asserted in the canvas layer.
5. The range lens shows correct hop badges (pure BFS, unit-tested in the domain layer).
6. Existing e2e suites pass with selector updates only — no flow changes.

## Rollout Shape

Tickets to be filed after this PRD is accepted; each phase ships independently (the canvas is DM-facing and the owner's table is the beta program):

- **P1** — the tiered zone card: three authored fields + defaults, tier renderer, description on DM surfaces, editor pickers.
- **P2** — thresholds replacing edges (the riskiest visual change, isolated): markers, pairing glow, state vocabulary, `ExitChip` dissolution, editor connect flow.
- **P3** — the overview layer: occupancy luminance + reveal border channel, gold keyline, cartouche, minimap, range lens.
- **P4** — watch polish, a11y pass, the state-matrix fixture suite.

## Resolved Questions

Decisions from the 2026-07-14 design session:

- **Approach: set pieces on a dark stage** — restyle in place over the node-graph. Considered and rejected: **abutting territory polygons** (strongest physicality, but raises geographic literalism, breaks the freeform editor, hardest token layout — wrong direction for a theater-of-the-mind game) and **overview-canvas + detail rail** (cheapest, but dodges sense-of-place and weakens the at-a-glance battlefield read).
- **Density: zoom only, no spotlight.** An "active zone renders expanded" mechanic was considered and rejected — detail view comes from zoom level, not app state.
- **Fixed footprints.** Card canvas footprint is a function of authored size alone; semantic zoom renders more inside the same bounds. This kills the card-growth/overlap problem structurally.
- **No lines, with a recorded fallback.** Shipping with zero connection lines at every tier. If real-table use shows threshold pairing is ambiguous on dense maps, the reserve design is a **Marquee-only dotted "constellation" hairline** — straight, faint, star-chart not corridor. Not built until needed.
- **Channel separation for the six-state problem.** Occupancy rides fill luminance; reveal rides border style + glyph; the party rides the gold keyline. Raised as a direct critique ("can brightness distinguish six states?" — no, and it shouldn't try).
- **Districts cut.** Procedural Dungeons' pages + Region cover the grouping/naming need; no third concept.
- **`description` reused, no subtitle field.** Clamped by tier instead of adding a field.
- **Naming:** "Region" is reserved by Procedural Dungeons; this PRD introduces no competing grouping term.
- **Illustrated Maps deferred to its own PRD** (see below) — raised mid-session as a possible 180, resolved as a second renderer over the same substrate, not a redirection of this overhaul.

## Open Questions (for the technical design)

- **Tier breakpoints** — the two zoom values separating Marquee/Stage/Closeup, and whether they need per-device tuning.
- **Footprint dimensions** — concrete S/M/L/XL sizes and their grid relationship.
- **The light palette** — final named washes and their OKLCH values within brand constraints.
- **Threshold hit-targets** — rim notches are smaller than full edges; pointer/touch target sizing needs care.
- **Range lens interaction** — always-on for selected zones vs. an explicit mode; how it composes with combat's move-target highlighting.
- **Cluster layout algorithm** — deterministic arrangement of engaged/free token groups within a footprint at each tier.

## Future: Illustrated Maps (not this PRD)

Captured from the same design session, so the thinking doesn't evaporate:

**The idea.** Traditional tabletop cartography is beautiful and communicates place/scale better than any abstraction — but it carries the 5-ft grid with it. Strip the grid, keep the picture: upload a map image and **trace Zones onto it with a rectangle tool**. Adjacency, reveal, occupancy, and every existing mechanic ride the same substrate; fog of war unmasks the artwork zone by zone. Lineage: the FATE-style *zone map* — regions drawn over an illustration, rules in the regions, fiction in the art.

**Why it's a second renderer, not a replacement.** Procedural Dungeons generates space just-in-time — generated zones have no artwork by construction, and the motivating campaign (Drakkenheim) lives mostly in generated space. So illustrated maps are a **mode for authored static maps**, coexisting with abstract set pieces. The natural seam is Procedural Dungeons' **pages**: a page gains an optional backdrop; the hand-drawn castle page is illustrated, the generated city pages are abstract. A portal threshold from painted castle to abstract streets is honest fiction.

**What transfers wholesale** (why this PRD's vocabulary is renderer-agnostic): thresholds become door pins placed on the artwork's painted doorways (adjacency still needs authoring — abutting rects across a painted wall must not read as adjacent); reveal becomes fog masking over art; occupancy luminance becomes literal lit rooms; zoom tiers still gate token detail; the channel matrix carries unchanged.

**Known hard edges for that PRD:** token density gets *worse* over art (rects are whatever the cartographer painted; tokens need a scrim and must **auto-arrange in a disciplined cluster, never free pixel placement** — free placement over art quietly rebuilds a gridless VTT and reintroduces position litigation); upload pipeline + tracing editor + masking renderer is a bigger build than this entire overhaul; rect-only tracing is the right v1 fence.
