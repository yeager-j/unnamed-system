import { db } from "@/lib/db/client"
import { campaignUsers } from "@/lib/db/schema/campaign"

/**
 * Persistence for campaign membership (`campaignUsers`). Like the other write
 * wrappers this is auth-free — the campaign authorization lives at the Server
 * Action boundary that calls it (UNN-327's `joinCampaignAction` gates on a valid
 * `joinToken` + signed-in viewer).
 */

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
