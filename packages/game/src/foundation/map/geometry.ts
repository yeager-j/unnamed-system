import { z } from "zod/v4"

/**
 * A **Map**'s authored geometry — the reusable, user-owned template the Dungeon
 * Map feature instantiates per run (Dungeon Map ADR, *The four-entity model*).
 * Persisted as one jsonb blob on the `map` row, guarded by a single `version`
 * token (the column, never part of this shape), mirroring how a
 * {@link import("../encounter/map-instance").MapInstanceState} persists on the
 * `mapInstance` row.
 *
 * This is the **authored** geometry the ADR names — Zones, connections with
 * `hidden`/`locked` flags, the node `(x, y)` layout, and per-Zone player-facing
 * descriptions + private DM notes. It is deliberately a **richer** shape than the
 * lean M0 {@link import("../encounter/map-instance").MapInstanceState} (zones +
 * adjacency only): an Instance snapshots this geometry plus carries runtime
 * (occupancy/reveal/engagement/enchantment). The two are distinct domains, so
 * this is its own module and does **not** reuse the Instance's lean `zoneSchema`.
 *
 * UNN-461's React Flow canvas is the editor that mutates this shape; UNN-460
 * ships the schema + the version-guarded persistence it autosaves through.
 */

/**
 * One authored Zone — a ~30 ft "theater of the mind" region (§3.5). Carries a
 * stable `id` (also its key in {@link MapGeometry.zones}, so a Zone is
 * self-describing), a DM-supplied display `name`, the player-facing
 * `description` shown on reveal, the private `dmNotes`, and the node `position`
 * for the canvas layout. The Zone *graph* (which zones connect) lives in
 * {@link MapGeometry.connections}, not here.
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
 * One authored connection between two Zones. Undirected — `fromZoneId`/`toZoneId`
 * name the endpoints in no particular order. The independent `hidden`/`locked`
 * flags are the **authored** fog/access geography (§3.5): `hidden` means players
 * don't see the connection until the DM reveals it; `locked` means it's visible
 * but blocks movement until unlocked. (At runtime an Instance overlays
 * reveal/unlock state on top of these immutable flags — that's a later
 * milestone; the template just authors the flags.)
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
 * `connections` keys a connection id to its {@link MapConnection} — a record (not
 * the Instance's `adjacency: Record<zoneId, zoneId[]>`, which can't carry the
 * per-edge `hidden`/`locked` flags) for O(1) flag toggles and a stable id per
 * edge (matching the canvas's id-keyed edge model). Both fields `.default()`
 * empty so a freshly-created Map parses, mirroring `mapInstanceStateSchema`.
 */
export const mapGeometrySchema = z.object({
  zones: z.record(z.string(), mapZoneSchema).default({}),
  connections: z.record(z.string(), mapConnectionSchema).default({}),
})
export type MapGeometry = z.infer<typeof mapGeometrySchema>
