import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { campaigns, campaignUsers } from "@/lib/db/schema/campaign"
import { characters } from "@/lib/db/schema/character"
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

/**
 * Removes `userId` from `campaignId`'s roster and **unplaces their characters**
 * (`characters.campaignId → null`) in one transaction. The `set null` FK on
 * `characters.campaignId` only fires when the *campaign* is deleted, not when a
 * `campaignUsers` row is — so the unplacing is an explicit `UPDATE` here (UNN-330
 * lifecycle ruling). The live-encounter lock that should block this mid-fight is
 * UNN-330's own concern and is not enforced at this layer.
 */
export async function removeCampaignMember(
  campaignId: string,
  userId: string
): Promise<void> {
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
      .update(characters)
      .set({ campaignId: null })
      .where(
        and(
          eq(characters.campaignId, campaignId),
          eq(characters.ownerId, userId)
        )
      )
  })
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
