import { z } from "zod/v4"

import { zoneEnchantmentSchema } from "@workspace/game/foundation/combat/enchantment"
import { engagementSchema } from "@workspace/game/foundation/combat/engagement"

/**
 * The **Map Instance** state — the per-run spatial truth the Dungeon Map feature
 * layers combat and exploration over (Dungeon Map ADR, *The four-entity model*).
 * Persisted as one versioned jsonb blob on the `mapInstance` row, exactly as a
 * {@link import("./session").CombatSession} persists on the encounter row: the
 * `version` is a row column, never part of this shape.
 *
 * The M0 cutover (UNN-459) lifted the spatial state off the `CombatSession` onto
 * here, with {@link import("@workspace/game/engine") reduceMapInstance} as its
 * sole writer. The shape **relocates the shipped spatial representations, it does
 * not re-model them**: a lean M0 cut of geometry (zones + adjacency), occupancy
 * (tokens carrying engagement), and the Enchantment singleton. Reveal-state,
 * connection hidden/locked flags, node layout, and per-Zone descriptions/DM notes
 * are fog-of-war concepts introduced by Map authoring (M1) and exploration (M2)
 * and are deliberately absent here.
 *
 * `Zone` is owned here (the zone graph is purely spatial); `engagementSchema` is
 * the neutral {@link import("../combat/engagement").Engagement} primitive shared
 * with the encounter-setup payload.
 */

/**
 * One Zone — a ~30 ft region of the battlefield (UNN-313). Carries a stable `id`
 * (also its key in {@link MapInstanceState.zones}, so a Zone is self-describing),
 * a DM-supplied display `name`, and optional free-text `notes`. The Zone *graph*
 * (which zones are adjacent) lives in {@link MapInstanceState.adjacency}, not
 * here — a Zone holds only its own identity. A token's position is the orthogonal
 * `zoneId` on its {@link MapToken}.
 */
export const zoneSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  notes: z.string().optional(),
})
export type Zone = z.infer<typeof zoneSchema>

/**
 * One occupancy token — a combatant's spatial presence on the Instance: where it
 * stands (`zoneId`) and who it's engaged with. Relocates today's per-combatant
 * `zoneId` + `engagement` (see {@link import("./session").combatantSchema}) onto
 * the Instance. Keyed in {@link MapInstanceState.occupancy} by the combatant id —
 * the join back to the (non-spatial) combat state on the Encounter. (The
 * PC-keyed-by-`characterId` cross-encounter persistence refinement and a richer
 * occupant union are left to UNN-454/UNN-459; M0 stays faithful to the shipped
 * per-combatant shape.)
 */
export const mapTokenSchema = z.object({
  zoneId: z.string(),
  engagement: engagementSchema,
})
export type MapToken = z.infer<typeof mapTokenSchema>

/**
 * The Map Instance's jsonb `state`. `zones` + `adjacency` are the spatial graph
 * (a zone id → its {@link import("./session").Zone}; a zone id → the ids it
 * borders, undirected); `occupancy` maps a combatant id to its {@link MapToken};
 * `enchantment` is the Bard's single active Zone Enchantment. Every field
 * `.default()`s empty so a freshly-minted Instance parses, matching how the
 * session defaults its spatial fields.
 */
export const mapInstanceStateSchema = z.object({
  zones: z.record(z.string(), zoneSchema).default({}),
  adjacency: z.record(z.string(), z.array(z.string())).default({}),
  occupancy: z.record(z.string(), mapTokenSchema).default({}),
  enchantment: zoneEnchantmentSchema.nullable().default(null),
})
export type MapInstanceState = z.infer<typeof mapInstanceStateSchema>
