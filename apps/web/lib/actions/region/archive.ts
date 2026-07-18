"use server"

import { err, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadRegionRowById } from "@/lib/db/queries/load-region"
import { archiveRegion } from "@/lib/db/writes/region"

import {
  ArchiveRegionSchema,
  type ArchiveRegionError,
  type ArchiveRegionInput,
} from "./archive.schema"
import { revalidateRegion } from "./revalidate"

/**
 * Archives a Region (`archivedAt` flip, UNN-589, DM-only) — hides it from campaign
 * discovery surfaces while its row survives for expedition history. Loads the row
 * to reach `campaignId` before `requireCampaignDM` (the `region-not-found`
 * disambiguation precedes auth).
 *
 * Archive does **not** touch expeditions: an archived Region may still have a
 * running expedition, which finishes on its own lifecycle. The guarded
 * `archiveRegion` returns the new `version` (or `stale`); on success both the
 * detail + Manage surfaces revalidate so the Region leaves the discovery list.
 */
export async function archiveRegionAction(
  input: ArchiveRegionInput
): Promise<Result<{ version: number }, ArchiveRegionError>> {
  const parsed = ArchiveRegionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const region = await loadRegionRowById(parsed.data.regionId)
  if (!region) return err("region-not-found")

  const campaign = await requireCampaignDM(region.campaignId)

  const result = await archiveRegion(
    parsed.data.regionId,
    parsed.data.expectedVersion
  )
  if (result.ok) {
    revalidateRegion({
      campaignShortId: campaign.shortId,
      regionShortId: region.shortId,
    })
  }
  return result
}
