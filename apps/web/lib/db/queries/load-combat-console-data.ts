import { getArchetype } from "@workspace/game/data"
import {
  zoneEnchantmentEffects,
  type PcCombatantDetail,
} from "@workspace/game/engine"

import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
import { resolvePartyCompositionBySide } from "@/lib/db/queries/party-composition"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

/**
 * The per-PC hydration the live combat surfaces need — shared by the standalone
 * combat console (`/combat/{shortId}`) and the dungeon run console's combat phase
 * (`/dungeon/{shortId}`, UNN-467), which both render the same rail/drawer over the
 * same session. Each PC combatant is hydrated with the encounter's party
 * composition for its own side and its zone's resolved Enchantment effects, so the
 * `perPartyLineage` Attack-Roll scalers (Magic Circle / Ailment Boost, UNN-367) and
 * a Toccata bonus resolve scaled rather than at base.
 *
 * Returns the two boundary maps the console passes down: `pcDetailById` (the
 * {@link PcCombatantDetail} view-model keyed by `characterId`, with the active
 * Archetype's display name resolved here so the drawer needn't reach into the
 * catalog) and `pcShortIdById` (the realtime character-channel key per PC, UNN-373
 * — app-layer transport data, deliberately not part of the engine view-model).
 */
export async function loadCombatConsoleData(
  encounter: Pick<EncounterRow, "session">,
  instance: Pick<MapInstanceRow, "state">
): Promise<{
  pcDetailById: Record<string, PcCombatantDetail>
  pcShortIdById: Record<string, string>
}> {
  const pcCombatants = encounter.session.combatants.flatMap((combatant) =>
    combatant.ref.kind === "pc"
      ? [
          {
            characterId: combatant.ref.characterId,
            side: combatant.side,
            zoneId: instance.state.occupancy[combatant.id]?.zoneId ?? "",
          },
        ]
      : []
  )

  const compositionBySide = await resolvePartyCompositionBySide(
    encounter.session
  )
  const hydrated = await Promise.all(
    pcCombatants.map(({ characterId, side, zoneId }) =>
      loadHydratedCharacterById(characterId, {
        partyComposition: compositionBySide[side],
        zoneEffects: zoneEnchantmentEffects(instance.state.enchantment, zoneId),
      })
    )
  )

  const present = hydrated.filter((character) => character !== null)
  const pcDetailById: Record<string, PcCombatantDetail> = Object.fromEntries(
    present.map((character) => [
      character.id,
      {
        ...character,
        className: character.activeArchetypeKey
          ? (getArchetype(character.activeArchetypeKey)?.name ?? null)
          : null,
      },
    ])
  )
  const pcShortIdById: Record<string, string> = Object.fromEntries(
    present.map((character) => [character.id, character.shortId])
  )

  return { pcDetailById, pcShortIdById }
}
