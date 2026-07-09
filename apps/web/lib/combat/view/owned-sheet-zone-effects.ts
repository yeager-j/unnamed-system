import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { zoneEnchantmentEffects } from "@workspace/game-v2/mechanics"
import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"

/**
 * The zone-sourced effects each owned combatant's sheet should currently be
 * resolved with, folded to a comparable key (UNN-566) — exactly the {@link
 * zoneEnchantmentEffects} input `loadOwnedEncounterSheets` resolves server-side,
 * so the key changes precisely when a re-load would produce different numbers
 * (an Enchantment applied / raised / cleared / moved, or an owned combatant
 * changing Zone) and holds still through turns, vitals churn, and moves between
 * un-Enchanted Zones. A spectator's key (no owned sheets) is a constant.
 *
 * A combatant's zone reads off its redacted `position` component — absent or
 * fog-blanked ⇒ no zone effects.
 */
export function ownedSheetZoneEffectsKey(
  snapshot: Pick<SpatialEncounterSnapshot, "enchantment" | "combatants">,
  ownedParticipantIds: readonly ParticipantId[]
): string {
  return JSON.stringify(
    ownedParticipantIds.map((participantId) => {
      const combatant = snapshot.combatants.find(
        (candidate) => candidate.id === participantId
      )
      const zoneId = combatant?.components.position?.zoneId
      return zoneId
        ? zoneEnchantmentEffects(snapshot.enchantment ?? null, zoneId)
        : []
    })
  )
}
