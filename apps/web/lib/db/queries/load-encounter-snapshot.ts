import { getArchetype } from "@workspace/game/data"
import {
  projectPlayerSnapshot,
  type EncounterSnapshot,
  type PcCombatantDetail,
} from "@workspace/game/engine"

import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
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
