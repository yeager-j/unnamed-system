import { and, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import {
  campaigns,
  campaignUsers,
  type CampaignRow,
} from "@/lib/db/schema/campaign"

/**
 * Reads for the `campaigns` table. The campaign is the durable DM↔player
 * boundary (ADR Decision 9); this loader backs the campaign-DM authorization
 * guard (`requireCampaignDM`) and the campaign surfaces (UNN-329). Nothing here
 * imports another db domain.
 */

/** The raw `campaigns` row by id, or `null` when no campaign matches. */
export async function loadCampaignRowById(
  campaignId: string
): Promise<CampaignRow | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)

  return row ?? null
}

/**
 * Every campaign a user runs as the DM (`dmUserId`), newest first. Backs the
 * thin `/campaigns` entry (UNN-335) that lists a DM's campaigns with a "New
 * encounter" button; the full My Campaigns / manage page is UNN-329.
 */
export async function loadCampaignsByDmUserId(
  dmUserId: string
): Promise<CampaignRow[]> {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.dmUserId, dmUserId))
    .orderBy(desc(campaigns.createdAt))
}

/**
 * The campaign behind a `/join/{joinToken}` link, or `null` when the token is
 * unknown — the only lookup the public join page (UNN-327) does. The token is
 * the access secret, so a non-match renders the "link no longer valid" state
 * rather than leaking whether any campaign exists.
 */
export async function loadCampaignByJoinToken(
  joinToken: string
): Promise<CampaignRow | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.joinToken, joinToken))
    .limit(1)

  return row ?? null
}

/**
 * Whether `userId` is already a `campaignUsers` member of `campaignId`. Drives
 * the join page's "already in" vs "join" branch (UNN-327) and stays index-only
 * — a `LIMIT 1` existence probe against the `(campaignId, userId)` primary key.
 * The DM is never a member row, so this is `false` for the DM (handled separately).
 */
export async function isCampaignMember(
  campaignId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ userId: campaignUsers.userId })
    .from(campaignUsers)
    .where(
      and(
        eq(campaignUsers.campaignId, campaignId),
        eq(campaignUsers.userId, userId)
      )
    )
    .limit(1)

  return row !== undefined
}
