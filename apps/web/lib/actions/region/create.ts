"use server"

import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadMapByShortId } from "@/lib/db/queries/load-map"
import { loadTemplateSetByShortId } from "@/lib/db/queries/load-template-set"
import { createRegion } from "@/lib/db/writes/region"

import {
  CreateRegionSchema,
  type CreateRegionError,
  type CreateRegionInput,
} from "./create.schema"
import { revalidateRegion } from "./revalidate"
import { checkWanderingDesignation } from "./wandering-designation"

/**
 * Creates a Region inside a campaign and returns its public `shortId` so the client
 * can redirect to the Region detail page — mirroring how `createDungeonAction` hands
 * back a `shortId`. A Region owns no Map Instance (D5): it only records the seed Map
 * + Template Set + authored settings; each expedition mints its own Instance at
 * start.
 *
 * Auth + ownership (the create-dungeon precedent): `requireCampaignDM` gates the
 * campaign (a non-DM trips `forbidden()` before any read), and both bound rows must
 * be owned by that DM — checked server-side via `row.userId === campaign.dmUserId`.
 * A Map/Set the DM doesn't own is a **domain refusal** (`map-not-found` /
 * `template-set-not-found`), not a 403: the DM binds only their own authoring rows,
 * and a forged foreign shortId reads as "not there" rather than leaking its
 * existence. `loadTemplateSetByShortId` already filters `deletedAt IS NULL`, so a
 * tombstoned Set is refused the same way.
 *
 * Wandering-table validation (D7): if `settings.wanderingTableKey` is designated, it
 * must name a table in the Set's content — else `wandering-table-not-found`. The
 * loader already parses `content` through `templateSetContentSchema`, so this reads
 * the healed `content.tables` directly rather than re-parsing.
 *
 * The client redirects to the returned Region on success; `revalidateRegion` still
 * fires so the campaign Manage list is fresh on back-navigation.
 */
export async function createRegionAction(
  input: CreateRegionInput
): Promise<Result<{ shortId: string }, CreateRegionError>> {
  const parsed = CreateRegionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const map = await loadMapByShortId(parsed.data.seedMapShortId)
  if (!map || map.userId !== campaign.dmUserId) return err("map-not-found")

  const templateSet = await loadTemplateSetByShortId(
    parsed.data.templateSetShortId
  )
  if (!templateSet || templateSet.userId !== campaign.dmUserId) {
    return err("template-set-not-found")
  }

  const designation = checkWanderingDesignation(
    templateSet.content,
    parsed.data.settings.wanderingTableKey
  )
  if (!designation.ok) return designation

  const { shortId } = await createRegion({
    campaignId: parsed.data.campaignId,
    name: parsed.data.name,
    seedMapId: map.id,
    templateSetId: templateSet.id,
    settings: parsed.data.settings,
  })

  revalidateRegion({
    campaignShortId: campaign.shortId,
    regionShortId: shortId,
  })
  return ok({ shortId })
}
