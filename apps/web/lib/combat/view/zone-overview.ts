import {
  participantDisplayNames,
  type ResolvedSession,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import {
  zoneEnchantmentBadge,
  type ZoneEnchantmentBadge,
} from "@/lib/combat/view/zone-enchantment-badge"
import { adjacencyMap } from "@/lib/combat/view/zone-graph"

/**
 * The mapless console's **battlefield layout** — the DM-side twin of the
 * watch's `buildWatchView` (`watch-layout.ts`), shaped from the console's
 * **optimistic** frame instead of the redacted snapshot so a move/placement
 * mirrors instantly. Both feed the same `ZoneLayout` grid
 * (`components/encounter/zone-layout.tssx`'s prop contract): one card per
 * authored zone with its occupant tokens, adjacency footer, and the
 * Enchantment badge; combatants without a token (or whose zone was deleted)
 * bucket into `unplaced`. Display-only v1 catalog read: the Enchantment badge
 * copy comes from the shared {@link zoneEnchantmentBadge} helper the watch
 * uses, so both surfaces describe a Toccata identically.
 */

export type { ZoneEnchantmentBadge }

export interface ConsoleZoneToken {
  id: ParticipantId
  name: string
  side: CombatSide
  portraitUrl: string | null
}

export interface ConsoleZoneEntry {
  id: string
  name: string
  adjacentZoneNames: string[]
  combatants: ConsoleZoneToken[]
  /** Present only on the zone holding the Instance's single Enchantment. */
  enchantment?: ZoneEnchantmentBadge
}

export interface ConsoleZoneLayout {
  zones: ConsoleZoneEntry[]
  unplaced: ConsoleZoneToken[]
  hasZones: boolean
}

/** Builds the battlefield layout for one (optimistic) frame, zones in authored
 *  order, tokens in session order. */
export function buildConsoleZoneLayout(
  instanceState: MapInstanceState,
  view: ResolvedSession
): ConsoleZoneLayout {
  const nameById = participantDisplayNames(view)

  const tokens: (ConsoleZoneToken & { zoneId: string | undefined })[] = [
    ...view.entries(),
  ].map(([participantId, participantView]) => ({
    id: participantId,
    name: nameById.get(participantId) ?? participantId,
    side: participantView.components.allegiance.side,
    portraitUrl: participantView.components.presentation?.portraitUrl ?? null,
    zoneId: instanceState.occupancy[participantId]?.zoneId,
  }))

  const zones = instanceState.geometry.zones
  const neighborsByZone = adjacencyMap(instanceState.geometry)

  return {
    zones: Object.values(zones).map((zone) => ({
      id: zone.id,
      name: zone.name,
      adjacentZoneNames: (neighborsByZone[zone.id] ?? []).flatMap((id) => {
        const name = zones[id]?.name
        return name === undefined ? [] : [name]
      }),
      combatants: tokens.filter((token) => token.zoneId === zone.id),
      enchantment: zoneEnchantmentBadge(instanceState.enchantment, zone.id),
    })),
    unplaced: tokens.filter(
      (token) => token.zoneId === undefined || zones[token.zoneId] === undefined
    ),
    hasZones: Object.keys(zones).length > 0,
  }
}
