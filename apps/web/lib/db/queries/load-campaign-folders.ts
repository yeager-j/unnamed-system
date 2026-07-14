import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import {
  campaignFolder,
  type CampaignFolderKind,
  type CampaignFolderRow,
} from "@/lib/db/schema/campaign-folder"

/**
 * The folder-tree read (UNN-579, D11): one kind's rows, campaign-scoped (§5's
 * read half). Unordered on purpose — `buildFolderForest` sorts the forest
 * alphabetically at every level.
 */
export async function loadCampaignFolders(
  campaignId: string,
  kind: CampaignFolderKind
): Promise<CampaignFolderRow[]> {
  return db
    .select()
    .from(campaignFolder)
    .where(
      and(
        eq(campaignFolder.campaignId, campaignId),
        eq(campaignFolder.kind, kind)
      )
    )
}
