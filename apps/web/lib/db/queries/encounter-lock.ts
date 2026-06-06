import { and, eq, inArray } from "drizzle-orm"

import {
  pcCombatantCharacterIds,
  sessionIncludesPc,
} from "@workspace/game/encounter"

import { db } from "@/lib/db/client"
import { loadLiveEncounterForCampaign } from "@/lib/db/queries/load-encounter"
import { characters } from "@/lib/db/schema/character"

/**
 * The **live-encounter lock** (ADR lifecycle rulings, UNN-330): a character that
 * is a combatant in a campaign's `live` encounter is pinned — it can't be
 * deleted, unplaced/moved, or have its owner kicked/leave, because any of those
 * would revoke the DM's `requireOwnerOrCampaignDM` write access to its vitals
 * mid-fight. These reads are the shared guard; the writes that mutate placement /
 * membership / existence consult them before proceeding.
 *
 * Both reuse {@link loadLiveEncounterForCampaign} + the pure encounter selectors,
 * so the "is this PC in the live session" logic lives in one tested place.
 */

/**
 * Whether `characterId` is a PC combatant in its current campaign's live
 * encounter. `false` when the character is unplaced or its campaign has no live
 * encounter. The single-character lock — consumed by `deleteCharacter` and
 * `setCharacterCampaign`.
 */
export async function isCharacterLiveEncounterCombatant(
  characterId: string
): Promise<boolean> {
  const [row] = await db
    .select({ campaignId: characters.campaignId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  const campaignId = row?.campaignId
  if (!campaignId) return false

  const live = await loadLiveEncounterForCampaign(campaignId)
  return live ? sessionIncludesPc(live.session, characterId) : false
}

/**
 * Whether `userId` owns any character that is a PC combatant in `campaignId`'s
 * live encounter. The member lock — consumed by `removeCampaignMember` (kick /
 * leave): a player can't be removed while one of their placed characters is mid-
 * fight. Intersects the live session's PC combatant ids with the characters the
 * player owns.
 */
export async function memberHasLiveEncounterCombatant(
  campaignId: string,
  userId: string
): Promise<boolean> {
  const live = await loadLiveEncounterForCampaign(campaignId)
  if (!live) return false

  const pcIds = pcCombatantCharacterIds(live.session)
  if (pcIds.length === 0) return false

  const owned = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(inArray(characters.id, pcIds), eq(characters.ownerId, userId)))
    .limit(1)

  return owned.length > 0
}
