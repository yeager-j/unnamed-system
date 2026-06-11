import { getArchetype } from "@workspace/game/data"
import {
  projectPlayerSnapshot,
  zoneEnchantmentEffects,
  type EncounterSnapshot,
  type PcCombatantDetail,
} from "@workspace/game/engine"
import { type HydratedCharacter } from "@workspace/game/foundation"

import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import {
  loadCharacterRowById,
  loadHydratedCharacterById,
} from "@/lib/db/queries/load-character"
import { resolvePartyCompositionBySide } from "@/lib/db/queries/party-composition"
import { resolveCatalogEnemyStatblocks } from "@/lib/game-engine"

import { loadEncounterRowByShortId } from "./load-encounter"

/**
 * Assembles the signed-out **player watch snapshot** for an encounter by its
 * public `shortId` (UNN-322), or `null` when no encounter matches (the page's
 * 404 / the API route's 404). The impure shell around the pure
 * {@link projectPlayerSnapshot}: it loads the encounter row and hydrates each
 * PC combatant's character (exactly as the DM console's `live` branch does) into
 * the `characterId`-keyed map the projector reads PC vitals from, then projects.
 *
 * The enemy-affinity/attribute **redaction lives in the projector**, so it is
 * unconditional and server-side — this loader never ships a combatant's full
 * state to the client, and deleting the watch view can't re-expose it (UNN-324).
 * Keyed by `shortId`, never the internal encounter id, so the public surface
 * (page + poll API) leaks no internal UUID.
 */
export async function getEncounterSnapshot(
  shortId: string
): Promise<EncounterSnapshot | null> {
  const encounter = await loadEncounterRowByShortId(shortId)
  if (!encounter) return null

  const pcCharacterIds = encounter.session.combatants.flatMap((combatant) =>
    combatant.ref.kind === "pc" ? [combatant.ref.characterId] : []
  )

  const [campaign, hydrated] = await Promise.all([
    loadCampaignRowById(encounter.campaignId),
    Promise.all(pcCharacterIds.map((id) => loadHydratedCharacterById(id))),
  ])

  const pcDetailById: Record<string, PcCombatantDetail> = Object.fromEntries(
    hydrated
      .filter((character) => character !== null)
      .map((c) => [
        c.id,
        {
          ...c,
          className: c.activeArchetypeKey
            ? (getArchetype(c.activeArchetypeKey)?.name ?? null)
            : null,
        },
      ])
  )

  return projectPlayerSnapshot(
    { ...encounter, campaignShortId: campaign?.shortId ?? "" },
    pcDetailById,
    resolveCatalogEnemyStatblocks(encounter.session.combatants)
  )
}

/** A PC combatant the watch viewer owns: the combatant id it occupies (the key
 *  the combat-state control writes overlay events against) + its hydrated sheet. */
export interface OwnedEncounterSheet {
  combatantId: string
  character: HydratedCharacter
}

/**
 * The hydrated sheets for the encounter's PC combatants the **signed-in viewer
 * owns** — what fills the watch view's left column (UNN player watch 3-column).
 * Empty for a spectator, a signed-out viewer, or a member with no placed
 * character here. A viewer can own more than one combatant in an encounter (the
 * column tabs between them).
 *
 * Privacy: ownership is decided on the cheap character *row* first, so only the
 * viewer's own characters are ever hydrated — another player's full sheet is
 * never loaded, let alone shipped. The redacted snapshot remains the only PC
 * data a non-owner receives.
 */
export async function loadOwnedEncounterSheets(
  shortId: string,
  viewerId: string
): Promise<OwnedEncounterSheet[]> {
  const encounter = await loadEncounterRowByShortId(shortId)
  if (!encounter) return []

  const pcCombatants = encounter.session.combatants.flatMap((combatant) =>
    combatant.ref.kind === "pc"
      ? [
          {
            combatantId: combatant.id,
            characterId: combatant.ref.characterId,
            side: combatant.side,
            zoneId: combatant.zoneId,
          },
        ]
      : []
  )

  const owned = (
    await Promise.all(
      pcCombatants.map(async (pc) => {
        const row = await loadCharacterRowById(pc.characterId)
        return row?.ownerId === viewerId ? pc : null
      })
    )
  ).filter((pc) => pc !== null)

  if (owned.length === 0) return []

  // The owned sheet's `Skills` section scales by the encounter's allied-Lineage
  // tally (UNN-367) and by the combatant's Zone Enchantment, so each is
  // hydrated with the party composition for the combatant's own side plus its
  // zone's resolved effects — the same scaled values the DM drawer shows.
  const compositionBySide = await resolvePartyCompositionBySide(
    encounter.session
  )

  const sheets = await Promise.all(
    owned.map(async (pc) => {
      const character = await loadHydratedCharacterById(pc.characterId, {
        partyComposition: compositionBySide[pc.side],
        zoneEffects: zoneEnchantmentEffects(
          encounter.session.enchantment,
          pc.zoneId
        ),
      })
      return character ? { combatantId: pc.combatantId, character } : null
    })
  )

  return sheets.filter((sheet) => sheet !== null)
}
