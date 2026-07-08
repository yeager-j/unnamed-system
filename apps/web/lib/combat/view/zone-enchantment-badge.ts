import { getEnchantment } from "@workspace/game-v2/mechanics/zone-enchantment"
import {
  forteMarking,
  type EnchantmentType,
  type ZoneEnchantment,
} from "@workspace/game-v2/mechanics/zone-enchantment.schema"

/**
 * The zone-Enchantment **badge** shaper (UNN-540, re-homed from v1's
 * `resolve-zone-layout.ts` per UNN-564 item 5): pure display shaping over the v2
 * Enchantment vocabulary, shared by the combat views (`watch-layout`,
 * `zone-overview`, the encounter zone grid) and the dungeon canvases.
 */

/** One rule line in the badge tooltip: the Forte that grants it, its rule
 *  text, and whether the Zone's current Forte has reached it (a Forte grants
 *  its own line and all lower Fortes'). */
export interface ForteLine {
  forte: number
  text: string
  active: boolean
}

/** The zone's active Enchantment as the badge renders it: the type key (for
 *  styling/tests), its resolved display name, the current Forte with its
 *  dynamic `marking` (*f / ff / fff*), and the per-Forte rule lines for the
 *  badge tooltip. */
export interface ZoneEnchantmentBadge {
  type: EnchantmentType
  name: string
  forte: number
  marking: string
  lines: ForteLine[]
}

/** The {@link ZoneEnchantmentBadge} for `zoneId`, or `undefined` when the
 *  Instance's Enchantment is absent or sits elsewhere. */
export function zoneEnchantmentBadge(
  enchantment: ZoneEnchantment | null,
  zoneId: string
): ZoneEnchantmentBadge | undefined {
  if (!enchantment || enchantment.zoneId !== zoneId) return undefined
  const definition = getEnchantment(enchantment.type)
  return {
    type: enchantment.type,
    name: definition.name,
    forte: enchantment.forte,
    marking: forteMarking(enchantment.forte),
    lines: definition.forteLines.map((text, index) => ({
      forte: index + 1,
      text,
      active: index + 1 <= enchantment.forte,
    })),
  }
}
