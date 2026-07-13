"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { setNpcArcana, setNpcLineage } from "@/lib/db/writes/campaign-world"

import {
  SetNpcArcanaSchema,
  SetNpcLineageSchema,
  type SetNpcArcanaError,
  type SetNpcArcanaInput,
  type SetNpcLineageError,
  type SetNpcLineageInput,
} from "./npc-traits.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * NPC trait writes (UNN-579, D8): Arcana advisory (duplicates warn in the
 * picker, never block), Lineage hard-unique (`"lineage-taken"` — the picker
 * disables taken rows, and the write refuses the race the UI can't see).
 * Traits feed list rows, badges, and the linker, so both revalidate.
 */
export async function setNpcArcanaAction(
  input: SetNpcArcanaInput
): Promise<Result<void, SetNpcArcanaError>> {
  const parsed = SetNpcArcanaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await setNpcArcana({ ...parsed.data, campaignId: campaign.id })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}

export async function setNpcLineageAction(
  input: SetNpcLineageInput
): Promise<Result<void, SetNpcLineageError>> {
  const parsed = SetNpcLineageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await setNpcLineage({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
