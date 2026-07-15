import { z } from "zod/v4"

/**
 * A **Map**'s authored geometry — the reusable, user-owned template the Dungeon
 * Map feature instantiates per run. Re-declared in v2 as pure Zod (D32); no
 * `@workspace/game` import. Persisted as one jsonb blob guarded by a single
 * `version` token (the column, never part of this shape).
 *
 * The authored geometry: Zones, connections with `hidden`/`locked` flags, the node
 * `(x, y)` layout, and per-Zone player-facing descriptions + private DM notes. The
 * standalone `reduceMapGeometry` editor (PR2) mutates this shape; the Map-Instance
 * snapshots it and overlays runtime state (occupancy/reveal/enchantment).
 */

/**
 * The closed set of Zone **motif** glyphs (UNN-630) — a DM-authored visual leitmotif
 * for a Zone, purely cosmetic (the engine never reads it; it drives an icon on the
 * canvas card). A closed enum, not free text: extending it is an enum member + an
 * icon in the renderer, a PR rather than an authoring surface.
 */
export const MAP_ZONE_MOTIFS = [
  "water",
  "stair",
  "bones",
  "statue",
  "altar",
  "treasure",
  "crates",
  "cell",
  "mechanism",
  "tomb",
] as const

/** A Zone's authored footprint size — one of four fixed world-rect tiers (UNN-630). */
export type MapZoneSize = "S" | "M" | "L" | "XL"
/** A Zone's authored motif glyph (UNN-630); one of {@link MAP_ZONE_MOTIFS}. */
export type MapZoneMotif = (typeof MAP_ZONE_MOTIFS)[number]
/** A Zone's authored lighting mood (UNN-630) — a background wash tint. */
export type MapZoneMood = "warm" | "dim" | "cool"

/**
 * One authored Zone — a ~30 ft "theater of the mind" region. Carries a stable `id`
 * (also its key in {@link MapGeometry.zones}, so a Zone is self-describing), a
 * DM-supplied display `name`, the player-facing `description` shown on reveal, the
 * private `dmNotes`, and the node `position` for the canvas layout. The Zone
 * *graph* (which zones connect) lives in {@link MapGeometry.connections}, not here.
 *
 * The three **identity** fields (`size`/`motif`/`mood`, UNN-630) are the DM's
 * cosmetic authoring of a Zone's visual character. All **optional** — absent stays
 * absent (the render side defaults `size ?? "M"`, no glyph, `mood ?? "dim"`), so
 * existing jsonb blobs parse unchanged with no migration. The engine assigns them no
 * mechanical meaning; they exist only to drive the canvas set-piece card.
 */
export const mapZoneSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  dmNotes: z.string().default(""),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.enum(["S", "M", "L", "XL"]).optional(),
  motif: z.enum(MAP_ZONE_MOTIFS).optional(),
  mood: z.enum(["warm", "dim", "cool"]).optional(),
})
export type MapZone = z.infer<typeof mapZoneSchema>

/**
 * One authored connection between two Zones. **Undirected** — `fromZoneId`/
 * `toZoneId` name the endpoints in no particular order. The independent `hidden`/
 * `locked` flags are the authored fog/access geography: `hidden` means players
 * don't see the connection until the DM reveals it; `locked` means it's visible but
 * blocks movement until unlocked. At runtime a Map-Instance overlays reveal/unlock
 * state on top of these immutable flags ({@link import("./map-instance.schema").RevealState}).
 */
export const mapConnectionSchema = z.object({
  id: z.string(),
  fromZoneId: z.string(),
  toZoneId: z.string(),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
})
export type MapConnection = z.infer<typeof mapConnectionSchema>

/**
 * The Map's jsonb `geometry`. `zones` keys a Zone id to its {@link MapZone};
 * `connections` keys a connection id to its {@link MapConnection} — a record (not a
 * flat adjacency list, which can't carry the per-edge `hidden`/`locked` flags) for
 * O(1) flag toggles and a stable id per edge (matching the canvas's id-keyed edge
 * model). Both fields `.default()` empty so a freshly-created Map parses.
 */
export const mapGeometrySchema = z.object({
  zones: z.record(z.string(), mapZoneSchema).default({}),
  connections: z.record(z.string(), mapConnectionSchema).default({}),
})
export type MapGeometry = z.infer<typeof mapGeometrySchema>
