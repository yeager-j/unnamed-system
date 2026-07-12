import { and, eq, inArray } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { db } from "@/lib/db/client"
import { memberHasLiveEncounterCombatant } from "@/lib/db/queries/encounter-lock"
import { loadLiveEncounterIdForCampaign } from "@/lib/db/queries/load-encounter-v2"
import { campaigns, campaignUsers } from "@/lib/db/schema/campaign"
import { campaignNpc } from "@/lib/db/schema/campaign-world"
import { encounters } from "@/lib/db/schema/encounter"
import { entity } from "@/lib/db/schema/entity"
import { mapInstances } from "@/lib/db/schema/map-instance"
import { playerCharacter } from "@/lib/db/schema/player-character"
import { insertWithShortId } from "@/lib/db/short-id"

/**
 * Persistence for the `campaigns` aggregate — the campaign row and its
 * `campaignUsers` membership. Like the other write wrappers this is auth-free;
 * the campaign authorization lives at the Server Action boundary that calls it
 * (`requireCampaignDM` for the DM-only writes, a signed-in check for join). No
 * version guard — the `campaigns` row has no optimistic-concurrency token and
 * `campaignUsers` is keyed by `(campaignId, userId)`.
 */

/**
 * Creates a campaign owned by `dmUserId` with a minted, collision-retried
 * `shortId` (the stable manage URL); the rotatable `joinToken` comes from the
 * column's `$defaultFn`. Returns the new `id` + `shortId` so the action can
 * redirect to the manage page (mirrors `createEncounter`).
 */
export async function createCampaign(input: {
  dmUserId: string
  name: string
  description?: string | null
}): Promise<{ id: string; shortId: string }> {
  return insertWithShortId(async (shortId) => {
    const [row] = await db
      .insert(campaigns)
      .values({
        shortId,
        dmUserId: input.dmUserId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning({ id: campaigns.id, shortId: campaigns.shortId })

    return row!
  })
}

/**
 * Rotates a campaign's `joinToken` so the previous `/join/{token}` link stops
 * working immediately (the "stranger with the link" mitigation — ADR Decision 9
 * edge cases). A plain `UPDATE` minting a fresh token from the same source as the
 * column default (`crypto.randomUUID()`). Returns the new token.
 */
export async function rotateJoinToken(campaignId: string): Promise<string> {
  const joinToken = crypto.randomUUID()
  await db
    .update(campaigns)
    .set({ joinToken })
    .where(eq(campaigns.id, campaignId))

  return joinToken
}

type RemoveCampaignMemberError = "live-encounter-lock"

/**
 * Removes `userId` from `campaignId`'s roster and **unplaces their characters**
 * (`playerCharacter.campaignId → null`; the placement column moved to the PC door
 * in R3 — UNN-573) in one transaction — the shared kick/leave cascade (UNN-329 +
 * UNN-330). The `set null` FK only fires when the *campaign* is deleted, not when
 * a `campaignUsers` row is, so the unplacing is an explicit `UPDATE` here.
 *
 * Refuses with `live-encounter-lock` when the player owns a character that is a
 * combatant in the campaign's live encounter (UNN-330): removing them would
 * unplace a live combatant and revoke the DM's mid-fight vitals access. The DM
 * must end the encounter or remove the combatant first.
 */
export async function removeCampaignMember(
  campaignId: string,
  userId: string
): Promise<Result<void, RemoveCampaignMemberError>> {
  if (await memberHasLiveEncounterCombatant(campaignId, userId)) {
    return err("live-encounter-lock")
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(campaignUsers)
      .where(
        and(
          eq(campaignUsers.campaignId, campaignId),
          eq(campaignUsers.userId, userId)
        )
      )

    await tx
      .update(playerCharacter)
      .set({ campaignId: null })
      .where(
        and(
          eq(playerCharacter.campaignId, campaignId),
          eq(playerCharacter.userId, userId)
        )
      )
  })

  return ok(undefined)
}

type DeleteCampaignError = "live-encounter-exists"

/**
 * Deletes a campaign (UNN-330). Refuses with `live-encounter-exists` while a
 * `live` encounter is running — the DM must end it first. Otherwise a
 * `DELETE FROM campaign`: Postgres cascade-deletes the `encounters` and
 * `campaignUsers` rows (`onDelete: "cascade"` FKs) and nulls every placed
 * `playerCharacter.campaignId` (`onDelete: "set null"` FK), so the characters
 * survive unplaced — no explicit UPDATE needed.
 *
 * The campaign's **NPC entities are soft-deleted first** (UNN-575): the
 * `campaignNpc` subtype rows cascade away with the campaign, which would
 * strand their live `entity` substrate rows (the subtype FK to `entity` has
 * no cascade — entities only tombstone), so we stamp `deletedAt` on them in
 * the same transaction before the cascade erases the pointer. PC entities are
 * untouched — their subtype survives unplaced.
 *
 * The encounters' Map Instances are **app-cleaned** here (UNN-459): the
 * `encounters.mapInstanceId → mapInstances` FK is `onDelete: "restrict"` (it
 * guards the *referenced* side), so the campaign cascade drops the encounters but
 * strands their Instance rows. We collect those ids first, drop the campaign
 * (cascading the encounters), then delete the now-unreferenced Instances — all in
 * one transaction so a failure can't half-orphan. In M0 each encounter mints its
 * own Instance (1:1, no sharing), so this never deletes one another live row
 * still references.
 */
export async function deleteCampaign(
  campaignId: string
): Promise<Result<void, DeleteCampaignError>> {
  const live = await loadLiveEncounterIdForCampaign(campaignId)
  if (live !== null) return err("live-encounter-exists")

  await db.transaction(async (tx) => {
    const instanceRows = await tx
      .select({ mapInstanceId: encounters.mapInstanceId })
      .from(encounters)
      .where(eq(encounters.campaignId, campaignId))

    await tx
      .update(entity)
      .set({ deletedAt: new Date() })
      .where(
        inArray(
          entity.id,
          tx
            .select({ id: campaignNpc.entityId })
            .from(campaignNpc)
            .where(eq(campaignNpc.campaignId, campaignId))
        )
      )

    await tx.delete(campaigns).where(eq(campaigns.id, campaignId))

    const mapInstanceIds = instanceRows.map((row) => row.mapInstanceId)
    if (mapInstanceIds.length > 0) {
      await tx
        .delete(mapInstances)
        .where(inArray(mapInstances.id, mapInstanceIds))
    }
  })

  return ok(undefined)
}

/**
 * Adds `userId` to `campaignId`'s roster, idempotently. The `(campaignId,
 * userId)` primary key is the natural idempotency guard, so a player who is
 * already a member is a no-op `ON CONFLICT DO NOTHING` rather than an error — the
 * reusable-link "a whole party joins off one" case (ADR Decision 9). No version
 * guard: `campaignUsers` carries no optimistic-concurrency token.
 */
export async function addCampaignMember(
  campaignId: string,
  userId: string
): Promise<void> {
  await db
    .insert(campaignUsers)
    .values({ campaignId, userId })
    .onConflictDoNothing()
}
