import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { loadLiveEncounterDurableEntityIds } from "@/lib/db/queries/load-encounter-session"
import { playerCharacter } from "@/lib/db/schema/player-character"

/**
 * The **live-encounter lock** (ADR lifecycle rulings, UNN-330): a character that
 * is a combatant in a campaign's `live` encounter is pinned — it can't be
 * deleted, unplaced/moved, or have its owner kicked/leave, because any of those
 * would revoke the DM's `requireOwnerOrCampaignDM` write access to its vitals
 * mid-fight. These reads are the shared guard; the writes that mutate placement /
 * membership / existence consult them before proceeding.
 *
 * Both reuse {@link loadLiveEncounterDurableEntityIds}, so the "is this
 * character in the live session" logic lives in one place. On v2 (UNN-535) the
 * v1 "PC combatant" is the **durable-locator participant** — the storage
 * lifecycle axis, not a kind tag.
 *
 * **Soft-delete (R1 — UNN-571): this lock stays `deletedAt`-blind and is itself
 * the guard.** It runs *before* the delete flow tombstones the row, so the
 * subject's `deletedAt` is null by construction; more to the point, this lock is
 * what keeps a live encounter free of tombstones, which is why the combat-adjacent
 * by-id hydration reads (`load-combat-console-data`, the snapshot fold) can
 * resolve pinned ids without a `deletedAt` filter. Filtering here would only
 * weaken that guarantee.
 */

/**
 * Whether `characterId` is a durable combatant in its current campaign's live
 * encounter. `false` when the character is unplaced or its campaign has no live
 * encounter. The single-character lock — consumed by `deleteCharacter` and
 * `setCharacterCampaign`.
 */
export async function isCharacterLiveEncounterCombatant(
  characterId: string
): Promise<boolean> {
  const [pc] = await db
    .select({ campaignId: playerCharacter.campaignId })
    .from(playerCharacter)
    .where(eq(playerCharacter.entityId, characterId))
    .limit(1)

  const campaignId = pc?.campaignId
  if (!campaignId) return false

  const durableIds = await loadLiveEncounterDurableEntityIds(campaignId)
  return durableIds !== null && durableIds.includes(characterId)
}

/**
 * Whether `userId` owns any character that is a durable combatant in
 * `campaignId`'s live encounter. The member lock — consumed by
 * `removeCampaignMember` (kick / leave): a player can't be removed while one of
 * their placed characters is mid-fight. Intersects the live session's durable
 * combatant ids with the characters the player owns.
 */
export async function memberHasLiveEncounterCombatant(
  campaignId: string,
  userId: string
): Promise<boolean> {
  const durableIds = await loadLiveEncounterDurableEntityIds(campaignId)
  if (durableIds === null || durableIds.length === 0) return false

  const owned = await db
    .select({ id: playerCharacter.entityId })
    .from(playerCharacter)
    .where(
      and(
        inArray(playerCharacter.entityId, durableIds),
        eq(playerCharacter.userId, userId)
      )
    )
    .limit(1)

  return owned.length > 0
}
