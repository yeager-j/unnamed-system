import { produce } from "immer"

import { MAX_FORTE } from "@workspace/game/foundation/combat/enchantment"
import type { CombatSession } from "@workspace/game/foundation/encounter/session"
import type { EnchantmentEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Zone-Enchantment slice — mutates the session's singleton `enchantment`
 * (never a combatant or zone), following the Immer-draft style of
 * {@link reduceZoneGraphEvent}:
 *
 * - `applyEnchantment` on the already-Enchanted Zone with the same type raises
 *   the Forte, capped at {@link MAX_FORTE} (rulebook "Forte"); any other Zone
 *   or type replaces the singleton at Forte 1 ("if you Enchant a second Zone,
 *   the first one loses its Enchantment" — and a new type starts a new
 *   Enchantment). No-op when `zoneId` isn't a current zone, the zone-graph
 *   precedent.
 * - `clearEnchantment` drops it; a no-op when none is active.
 */
export function reduceEnchantmentEvent(
  session: CombatSession,
  event: EnchantmentEvent
): CombatSession {
  return produce(session, (draft) => {
    switch (event.kind) {
      case "applyEnchantment": {
        if (draft.zones[event.zoneId] === undefined) return

        const current = draft.enchantment
        const sameZoneAndType =
          current?.zoneId === event.zoneId && current.type === event.enchantment

        draft.enchantment = sameZoneAndType
          ? { ...current, forte: Math.min(current.forte + 1, MAX_FORTE) }
          : { zoneId: event.zoneId, type: event.enchantment, forte: 1 }
        return
      }

      case "clearEnchantment": {
        if (draft.enchantment === null) return
        draft.enchantment = null
        return
      }
    }
  })
}
