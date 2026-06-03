import { desc, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { campaigns, type CampaignRow } from "@/lib/db/schema/campaign"

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
