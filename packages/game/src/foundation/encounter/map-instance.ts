import { z } from "zod/v4"

import { zoneEnchantmentSchema } from "@workspace/game/foundation/combat/enchantment"

import { engagementSchema, zoneSchema } from "./session"

/**
 * The **Map Instance** state — the per-run spatial truth the Dungeon Map feature
 * layers combat and exploration over (Dungeon Map ADR, *The four-entity model*).
 * Persisted as one versioned jsonb blob on the `mapInstance` row, exactly as a
 * {@link import("./session").CombatSession} persists on the encounter row: the
 * `version` is a row column, never part of this shape.
 *
 * This is **additive M0 scaffolding** (UNN-450) — nothing populates it yet. The
 * destructive cutover (UNN-459) lifts the spatial state off the `CombatSession`
 * onto here, and {@link import("@workspace/game/engine") reduceMapInstance}
 * (UNN-454) becomes its sole writer. Accordingly the shape **relocates the
 * shipped spatial representations, it does not re-model them**: a lean M0 cut of
 * geometry (zones + adjacency), occupancy (tokens carrying engagement), and the
 * Enchantment singleton. Reveal-state, connection hidden/locked flags, node
 * layout, and per-Zone descriptions/DM notes are fog-of-war concepts introduced
 * by Map authoring (M1) and exploration (M2) and are deliberately absent here.
 *
 * The `zoneSchema`/`engagementSchema` imports from `./session` are a **transient**
 * same-domain reuse: the cutover stops the session exporting them and makes this
 * module their canonical home, so this is debt the cutover resolves — not a
 * permanent coupling.
 */

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
