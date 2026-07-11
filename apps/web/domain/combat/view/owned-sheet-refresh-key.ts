import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { zoneEnchantmentEffects } from "@workspace/game-v2/mechanics"
import type {
  SpatialEncounterSnapshot,
  VisibleCombatant,
} from "@workspace/game-v2/visibility"

/**
 * Everything the server baked into an owned combatant's sheet that the watch can
 * observe moving client-side, folded to one comparable key (UNN-566): the
 * combatant's zone-sourced Enchantment effects, and its durable pools.
 *
 * The own-sheet column renders **server-resolved** props while the snapshot
 * updates client-side, so this key answers one question each poll: *would
 * re-pulling those props produce a different sheet?* It changes when an
 * Enchantment is applied / raised / cleared / moved, when an owned combatant
 * changes Zone, and when the DM damages or heals one. It holds still through
 * turn order, enemy vitals, and moves between un-Enchanted Zones. A spectator's
 * key (no owned sheets) is a constant.
 *
 * The **pools** are here because they are the degraded path's only signal: with
 * realtime up, a durable commit pings `character:{shortId}` and the provider
 * refreshes; with no `ABLY_API_KEY` that ping never arrives, and this key is all
 * that stands between the battlefield token reading 14 HP and the sheet beside
 * it still reading 20. Rendering the pools *from* the snapshot would be the
 * wrong fix — HP would have two homes, and this column writes through the entity
 * door — so it re-pulls the one home instead.
 *
 * Zone and pools read off the redacted components: `vitals`/`skillPool` are
 * public-to-all (an owner always sees its own), and `position` is absent or
 * fog-blanked when unplaced ⇒ no zone effects.
 */
export function ownedSheetRefreshKey(
  snapshot: Pick<SpatialEncounterSnapshot, "enchantment" | "combatants">,
  ownedParticipantIds: readonly ParticipantId[]
): string {
  return JSON.stringify(
    ownedParticipantIds.map((participantId) => {
      const combatant = snapshot.combatants.find(
        (candidate) => candidate.id === participantId
      )
      return combatant
        ? [zoneEffectsOf(snapshot, combatant), poolsOf(combatant)]
        : []
    })
  )
}

function zoneEffectsOf(
  snapshot: Pick<SpatialEncounterSnapshot, "enchantment">,
  combatant: VisibleCombatant
) {
  const zoneId = combatant.components.position?.zoneId
  return zoneId
    ? zoneEnchantmentEffects(snapshot.enchantment ?? null, zoneId)
    : []
}

/** The durable pools as the snapshot carries them — `null` when redaction
 *  dropped the component, never a `0/0` lie. */
function poolsOf(combatant: VisibleCombatant) {
  const { vitals, skillPool } = combatant.components
  return {
    hp: vitals ? [vitals.currentHP, vitals.maxHP] : null,
    sp: skillPool ? [skillPool.currentSP, skillPool.maxSP] : null,
  }
}
