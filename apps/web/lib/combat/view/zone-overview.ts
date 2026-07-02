import {
  participantDisplayNames,
  type ResolvedSession,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  ENCHANTMENTS_BY_TYPE,
  type EnchantmentType,
} from "@workspace/game-v2/mechanics"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

/**
 * The mapless console's at-a-glance **zone overview** — one card per authored
 * zone with its occupants and (when it holds the singleton) the active Zone
 * Enchantment. The lightweight v2 replacement for v1's `resolveZoneLayout`
 * battlefield shaper: the mapless console lists zones, it doesn't lay out a
 * canvas (the spatial dungeon canvas is PR11c's concern).
 */

export interface ZoneEnchantmentBadge {
  type: EnchantmentType
  name: string
  forte: number
}

export interface ZoneOverview {
  id: string
  name: string
  occupantNames: string[]
  /** Present only on the zone holding the Instance's single Enchantment. */
  enchantment?: ZoneEnchantmentBadge
}

/** Builds the zone cards for one (optimistic) frame, in authored order. */
export function buildZoneOverview(
  instanceState: MapInstanceState,
  view: ResolvedSession
): ZoneOverview[] {
  const nameById = participantDisplayNames(view)

  const occupantsByZone = new Map<string, string[]>()
  for (const [tokenKey, token] of Object.entries(instanceState.occupancy)) {
    const label = nameById.get(tokenKey as ParticipantId)
    if (label === undefined) continue
    const names = occupantsByZone.get(token.zoneId) ?? []
    names.push(label)
    occupantsByZone.set(token.zoneId, names)
  }

  const enchantment = instanceState.enchantment
  return Object.values(instanceState.geometry.zones).map((zone) => ({
    id: zone.id,
    name: zone.name,
    occupantNames: occupantsByZone.get(zone.id) ?? [],
    ...(enchantment && enchantment.zoneId === zone.id
      ? {
          enchantment: {
            type: enchantment.type,
            name: ENCHANTMENTS_BY_TYPE[enchantment.type].name,
            forte: enchantment.forte,
          },
        }
      : {}),
  }))
}
