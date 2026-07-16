import { z } from "zod/v4"

import { engagementSchema } from "@workspace/game-v2/kernel/vocab/engagement"
import { zoneEnchantmentSchema } from "@workspace/game-v2/mechanics/zone-enchantment.schema"

import { mapGeometrySchema } from "./geometry.schema"

/**
 * The **Map-Instance** state — the per-run spatial truth the Dungeon Map feature
 * layers combat and exploration over. Re-declared in v2 as pure Zod (D32). Persisted
 * as one versioned jsonb blob on the `mapInstance` row; the `version` is a row
 * column, never part of this shape. `reduceMapInstance` (PR2) is the sole writer.
 *
 * It carries the snapshotted authored {@link import("./geometry.schema").MapGeometry}
 * plus the runtime overlays: token occupancy, the {@link RevealState} fog overlay,
 * and the Bard's single Zone {@link import("@workspace/game-v2/mechanics/zone-enchantment.schema").ZoneEnchantment}.
 */

/**
 * One occupancy token — a combatant's spatial presence: where it stands (a bare
 * `zoneId`) and who it's engaged with. The token stores a **bare `zoneId` string**,
 * not a `Position` component — the combat-side loader wraps it into `Position` for
 * the read-bag (so spatial owns the *fact* of placement without naming the
 * *component*). Keyed in {@link MapInstanceState.occupancy} **opaquely**: by the
 * combatant's `participantId` during combat, by its `characterId` during
 * exploration (so the delve roster derives from occupancy directly).
 */
export const mapTokenSchema = z.object({
  zoneId: z.string(),
  engagement: engagementSchema,
})
export type MapToken = z.infer<typeof mapTokenSchema>

/**
 * The runtime fog overlay on top of the snapshotted, immutable connection
 * `hidden`/`locked` flags. All three are sets-as-arrays keyed by geometry id:
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
 * The Map-Instance's jsonb `state`. `geometry` is the snapshot of the Map's authored
 * geometry; `occupancy` maps a token key to its {@link MapToken}; `reveal` is the
 * runtime fog overlay; `enchantment` is the Bard's single active Zone Enchantment (a
 * nullable singleton — a second Enchant overwrites). `lastMovedTokenKey` is the
 * token that most recently moved or was placed (UNN-586) — the watch's
 * follow-the-party page hint (D3); an opaque dual-lifecycle key that may dangle
 * after a combat prune, so readers resolve it defensively and never trust it raw.
 * Every field `.default()`s empty so a freshly-minted Instance parses.
 */
export const mapInstanceStateSchema = z.object({
  geometry: mapGeometrySchema.default(() => mapGeometrySchema.parse({})),
  occupancy: z.record(z.string(), mapTokenSchema).default({}),
  enchantment: zoneEnchantmentSchema.nullable().default(null),
  reveal: revealStateSchema.default({
    revealedZoneIds: [],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  }),
  lastMovedTokenKey: z.string().nullable().default(null),
})
export type MapInstanceState = z.infer<typeof mapInstanceStateSchema>
