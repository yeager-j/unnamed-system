"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { softDeleteNpc } from "@/lib/db/writes/campaign-world"

import {
  DeleteNpcSchema,
  type DeleteNpcError,
  type DeleteNpcInput,
} from "./delete-npc.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * Tombstones an NPC (D4): stamps `entity.deletedAt` and clears the subtype's
 * `arcana`/`lineageKey` in one transaction — the NPC leaves the linker and
 * list surfaces, history keeps rendering its name muted, and the Lineage
 * returns to the deck (D8).
 */
export async function deleteNpcAction(
  input: DeleteNpcInput
): Promise<Result<void, DeleteNpcError>> {
  const parsed = DeleteNpcSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await softDeleteNpc({
    campaignId: campaign.id,
    entityId: parsed.data.entityId,
  })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
