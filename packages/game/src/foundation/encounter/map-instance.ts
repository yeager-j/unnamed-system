import { z } from "zod/v4"

import { zoneEnchantmentSchema } from "@workspace/game/foundation/combat/enchantment"
import { engagementSchema } from "@workspace/game/foundation/combat/engagement"
import {
  mapGeometrySchema,
  type MapZone,
} from "@workspace/game/foundation/map/geometry"

/**
 * The **Map Instance** state — the per-run spatial truth the Dungeon Map feature
 * layers combat and exploration over (Dungeon Map ADR, *The four-entity model*).
 * Persisted as one versioned jsonb blob on the `mapInstance` row, exactly as a
 * {@link import("./session").CombatSession} persists on the encounter row: the
 * `version` is a row column, never part of this shape.
 *
 * The M0 cutover (UNN-459) lifted the spatial state off the `CombatSession` onto
 * here with a **lean** geometry (zones + flat adjacency). M2 (UNN-464) converges
 * that geometry onto the authored {@link MapGeometry} template shape so the
 * Instance can be rendered on the React Flow canvas and drive fog-of-war: it now
 * carries the same node `(x, y)` layout, per-Zone descriptions/DM notes, and
 * id-keyed `connections` with `hidden`/`locked` flags the Map authors, **plus**
 * the runtime {@link RevealState} overlay (which Zones / hidden connections are
 * revealed and which locked connections are unlocked *right now*). Occupancy
 * (tokens carrying engagement) and the Enchantment singleton are unchanged.
 * {@link import("@workspace/game/engine") reduceMapInstance} is the sole writer.
 */

/**
 * One occupancy token — a combatant's spatial presence on the Instance: where it
 * stands (`zoneId`) and who it's engaged with. Relocates today's per-combatant
 * `zoneId` + `engagement` (see {@link import("./session").combatantSchema}) onto
 * the Instance. Keyed in {@link MapInstanceState.occupancy} by the **combatant
 * id** during combat; during exploration a PC token is keyed by its
 * **`characterId`** (UNN-464 Decision 6) so the Dungeon's `actedCharacterIds`
 * roster derives from occupancy directly.
 */
export const mapTokenSchema = z.object({
  zoneId: z.string(),
  engagement: engagementSchema,
})
export type MapToken = z.infer<typeof mapTokenSchema>

/**
 * The runtime fog overlay on top of the snapshotted, immutable connection
 * `hidden`/`locked` flags (UNN-464). All three are sets-as-arrays keyed by
 * geometry id:
 *
 * - `revealedZoneIds` — Zones the party has discovered. The `move → reveal` rule
 *   adds the entered Zone; the DM may also reveal/hide a Zone manually.
 * - `revealedConnectionIds` — **hidden** connections the DM has manually surfaced.
 *   A non-hidden connection needs no entry: it is a *known-exit silhouette* the
 *   moment one of its endpoints is revealed (derived, never stored here).
 * - `unlockedConnectionIds` — **locked** connections the DM has opened; a locked
 *   connection shows as a known-exit but blocks movement until its id is here.
 */
export const revealStateSchema = z.object({
  revealedZoneIds: z.array(z.string()).default([]),
  revealedConnectionIds: z.array(z.string()).default([]),
  unlockedConnectionIds: z.array(z.string()).default([]),
})
export type RevealState = z.infer<typeof revealStateSchema>

/**
 * The Map Instance's jsonb `state`. `geometry` is the snapshot of the Map's
 * authored geometry (Zones with `(x,y)`/description/DM notes; id-keyed
 * connections with `hidden`/`locked`); `occupancy` maps a token key to its
 * {@link MapToken}; `reveal` is the runtime fog overlay; `enchantment` is the
 * Bard's single active Zone Enchantment. Every field `.default()`s empty so a
 * freshly-minted Instance parses, matching how the session defaults its fields.
 */
export const mapInstanceStateSchema = z.object({
  geometry: mapGeometrySchema.default({ zones: {}, connections: {} }),
  occupancy: z.record(z.string(), mapTokenSchema).default({}),
  enchantment: zoneEnchantmentSchema.nullable().default(null),
  reveal: revealStateSchema.default({
    revealedZoneIds: [],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  }),
})
export type MapInstanceState = z.infer<typeof mapInstanceStateSchema>

/**
 * The redacted **display projection** of a {@link MapZone} — `id` + `name` only.
 * The geometry's full {@link MapZone} carries player-facing `description` and
 * private `dmNotes`; consumers that surface a Zone to a list, a move target, or
 * the **public** player snapshot project down to this shape so `dmNotes` never
 * crosses the wire (the player-snapshot redaction is a release gate — ADR
 * *Player view: redaction & snapshot*).
 */
export type Zone = Pick<MapZone, "id" | "name">
