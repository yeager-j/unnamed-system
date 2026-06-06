import { eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { isCharacterLiveEncounterCombatant } from "@/lib/db/queries/encounter-lock"
import { characters } from "@/lib/db/schema/character"

/**
 * Persistence for character placement — the owner setting `characters.campaignId`
 * (ADR Decision 9). Auth lives at the Server Action boundary (`requireOwner` +
 * the target-membership check in `setCharacterCampaignAction`); this layer owns
 * the **single-campaign move** (one atomic `UPDATE` handles unplace-old +
 * place-new) and the **live-encounter lock**.
 */

export type CharacterPlacementError =
  | "character-not-found"
  | "live-encounter-lock"

/**
 * Sets a character's `campaignId` to `newCampaignId` (a campaign id to place /
 * move, or `null` to unplace). When the character is leaving a campaign it is
 * currently placed in (`currentCampaignId` non-null and changing), refuses the
 * write if that campaign has a `live` encounter the character is a combatant in
 * (`live-encounter-lock`) — unplacing a live combatant would revoke the DM's
 * mid-fight vitals access (UNN-330 lifecycle ruling). Placing an unplaced
 * character never hits the lock.
 *
 * The actual move is one statement: `UPDATE characters SET campaignId = $new
 * WHERE id = $id`. Zero rows → `character-not-found` (a race with deletion, since
 * the action's `requireOwner` already loaded the row).
 */
export async function setCharacterCampaign(
  characterId: string,
  currentCampaignId: string | null,
  newCampaignId: string | null
): Promise<Result<void, CharacterPlacementError>> {
  const leavingCampaign =
    currentCampaignId !== null && currentCampaignId !== newCampaignId

  if (
    leavingCampaign &&
    (await isCharacterLiveEncounterCombatant(characterId))
  ) {
    return err("live-encounter-lock")
  }

  const updated = await db
    .update(characters)
    .set({ campaignId: newCampaignId })
    .where(eq(characters.id, characterId))
    .returning({ id: characters.id })

  return updated.length === 0 ? err("character-not-found") : ok(undefined)
}
