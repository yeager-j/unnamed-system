import { forbidden } from "next/navigation"

import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import type { CampaignRow } from "@/lib/db/schema/campaign"

import { auth } from "./index"

/**
 * Authorization gate for campaign-DM-only mutations — the encounter side of the
 * boundary `requireOwner` (`viewer-role.ts`) draws for character sheets. A
 * campaign has exactly one DM (`campaign.dmUserId`, ADR Decision 9); running an
 * encounter, editing its session, and the DM-vitals writes all require that the
 * caller *is* that DM.
 *
 * Loads the campaign by id, compares its `dmUserId` to the current session's
 * user id, and trips `forbidden()` (HTTP 403) on any mismatch — missing
 * session, missing campaign, or signed-in-but-not-the-DM. Returns the loaded
 * row on success so callers don't re-query.
 *
 * Use at the top of every Server Action that runs or mutates an encounter.
 * UNN-297's `requireOwnerOrCampaignDM(characterId)` composes the same DM check
 * (character → `campaignId` → this comparison) with the owner check.
 */
export async function requireCampaignDM(
  campaignId: string
): Promise<CampaignRow> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const campaign = await loadCampaignRowById(campaignId)
  if (!campaign || campaign.dmUserId !== viewerId) forbidden()

  return campaign
}
