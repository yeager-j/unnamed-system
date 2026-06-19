import type {
  EncounterSnapshot,
  PlayerVisibleCombatant,
} from "@workspace/game/engine/encounter/player-snapshot"
import {
  zoneEnchantmentBadge,
  zoneIsEngaged,
  type ZoneLayoutView,
  type ZoneToken,
} from "@workspace/game/engine/encounter/resolve-zone-layout"

/**
 * Battlefield shaping for the player watch view — the read-only, redacted peer of
 * the DM console's {@link import("./resolve-zone-layout").resolveZoneLayout}. It
 * shapes the **same** {@link ZoneLayoutView} from the snapshot so the watch view
 * renders the DM's battlefield grid component unchanged (the 3-column upgrade
 * collapsed the bespoke player zone-map into this shared shape). Pure — recomputed
 * on every poll, no `.filter().map()` in the component (CLAUDE.md convention).
 */

/** Projects a snapshot combatant to a battlefield token. `engagement` is omitted
 *  (the redacted snapshot carries no `Engagement` object); the grid ignores it. */
function playerZoneToken(combatant: PlayerVisibleCombatant): ZoneToken {
  return {
    id: combatant.id,
    name: combatant.name,
    side: combatant.side,
    isPc: combatant.kind === "pc",
    portraitUrl: combatant.portraitUrl,
  }
}

/**
 * Shapes a {@link ZoneLayoutView} from the redacted snapshot: groups combatants
 * under their `zoneId` (in `snapshot.zones` order), resolves each zone's
 * `adjacency` ids to display names for the "Borders" footer, and buckets any
 * combatant whose `zoneId` matches no current zone into `unplaced`.
 */
export function resolvePlayerZoneLayout(
  snapshot: EncounterSnapshot
): ZoneLayoutView {
  const zoneIds = new Set(snapshot.zones.map((zone) => zone.id))
  const nameById = new Map(snapshot.zones.map((zone) => [zone.id, zone.name]))

  const zones = snapshot.zones.map((zone) => {
    const combatants = snapshot.combatants
      .filter((combatant) => combatant.zoneId === zone.id)
      .map(playerZoneToken)
    return {
      id: zone.id,
      name: zone.name,
      adjacentZoneNames: (snapshot.adjacency[zone.id] ?? []).flatMap((id) => {
        const name = nameById.get(id)
        return name === undefined ? [] : [name]
      }),
      combatants,
      enchantment: zoneEnchantmentBadge(snapshot.enchantment, zone.id),
      engaged: zoneIsEngaged(combatants),
    }
  })

  const unplaced = snapshot.combatants
    .filter((combatant) => !zoneIds.has(combatant.zoneId))
    .map(playerZoneToken)

  return { zones, unplaced, hasZones: snapshot.zones.length > 0 }
}
