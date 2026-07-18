"use server"

import { err, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadRegionRowById } from "@/lib/db/queries/load-region"
import { loadTemplateSetRowById } from "@/lib/db/queries/load-template-set"
import { updateRegionSettings } from "@/lib/db/writes/region"

import { revalidateRegion } from "./revalidate"
import {
  UpdateRegionSettingsSchema,
  type UpdateRegionSettingsError,
  type UpdateRegionSettingsInput,
} from "./update-settings.schema"
import { checkWanderingDesignation } from "./wandering-designation"

/**
 * Updates a Region's authored settings + name (UNN-589 D7, DM-only). Loads the
 * Region by id to reach its `campaignId` before the `requireCampaignDM` gate (the
 * `region-not-found` disambiguation precedes auth, mirroring `setDungeonStatusAction`).
 *
 * Wandering-table validation runs against the Region's **current** Template Set
 * (fixed at create — this action can't rebind it). It loads the Set **only** when a
 * `wanderingTableKey` needs checking; with no key there's nothing to validate, so
 * the load is skipped. A deleted Set row (the loader filters `deletedAt IS NULL`)
 * surfaces as `template-set-not-found` — but only in the with-key case, since a
 * keyless settings edit shouldn't be blocked by a Set that tombstoned out from
 * under the Region.
 *
 * The guarded `updateRegionSettings` returns the new `version` (or `stale`); on
 * success both the detail + Manage surfaces revalidate.
 */
export async function updateRegionSettingsAction(
  input: UpdateRegionSettingsInput
): Promise<Result<{ version: number }, UpdateRegionSettingsError>> {
  const parsed = UpdateRegionSettingsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const region = await loadRegionRowById(parsed.data.regionId)
  if (!region) return err("region-not-found")

  const campaign = await requireCampaignDM(region.campaignId)

  const { wanderingTableKey } = parsed.data.settings
  if (wanderingTableKey) {
    const templateSet = await loadTemplateSetRowById(region.templateSetId)
    if (!templateSet) return err("template-set-not-found")
    const designation = checkWanderingDesignation(
      templateSet.content,
      wanderingTableKey
    )
    if (!designation.ok) return designation
  }

  const result = await updateRegionSettings(
    parsed.data.regionId,
    { name: parsed.data.name, settings: parsed.data.settings },
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
