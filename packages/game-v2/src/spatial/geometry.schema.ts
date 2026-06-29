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
 * One authored Zone — a ~30 ft "theater of the mind" region. Carries a stable `id`
 * (also its key in {@link MapGeometry.zones}, so a Zone is self-describing), a
 * DM-supplied display `name`, the player-facing `description` shown on reveal, the
 * private `dmNotes`, and the node `position` for the canvas layout. The Zone
 * *graph* (which zones connect) lives in {@link MapGeometry.connections}, not here.
 */
export const mapZoneSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  dmNotes: z.string().default(""),
  position: z.object({ x: z.number(), y: z.number() }),
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
