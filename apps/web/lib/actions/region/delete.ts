"use server"

import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  loadRegionRowById,
  regionHasExpeditions,
} from "@/lib/db/queries/load-region"
import { hardDeleteRegion } from "@/lib/db/writes/region"

import {
  DeleteRegionSchema,
  type DeleteRegionError,
  type DeleteRegionInput,
} from "./delete.schema"
import { revalidateRegion } from "./revalidate"

/**
 * Hard-deletes a Region (UNN-589, DM-only) — legal only in the zero-expedition
 * mistake case. Loads the row to reach `campaignId` before `requireCampaignDM`
 * (the `region-not-found` disambiguation precedes auth), then refuses with
 * `region-has-expeditions` when any expedition ever referenced it
 * ({@link regionHasExpeditions} counts soft-deleted rows too — frozen history keeps
 * resolving them, and `dungeon.regionId`'s NO ACTION FK is the DB backstop if this
 * check were somehow skipped). A Region owns no Map Instance (D5), so the delete is
 * a single row. Revalidates the Manage + detail surfaces.
 */
export async function deleteRegionAction(
  input: DeleteRegionInput
): Promise<Result<void, DeleteRegionError>> {
  const parsed = DeleteRegionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const region = await loadRegionRowById(parsed.data.regionId)
  if (!region) return err("region-not-found")

  const campaign = await requireCampaignDM(region.campaignId)

  if (await regionHasExpeditions(region.id)) {
    return err("region-has-expeditions")
  }

  await hardDeleteRegion(region.id)

  revalidateRegion({
    campaignShortId: campaign.shortId,
    regionShortId: region.shortId,
  })
  return ok(undefined)
}
