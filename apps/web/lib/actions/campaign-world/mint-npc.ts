"use server"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { mintNpc } from "@/lib/db/writes/campaign-world"

import {
  MintNpcSchema,
  type MintNpcError,
  type MintNpcInput,
} from "./mint-npc.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * Quick-mints an NPC into the gated campaign (UNN-575): an `entity` substrate
 * row plus its `campaignNpc` subtype row, one transaction, shared id (D2).
 * The `campaignId` the write receives is the **gated campaign's own id** —
 * the write-boundary rule (§5) — so the linker can never mint into a foreign
 * campaign.
 */
export async function mintNpcAction(
  input: MintNpcInput
): Promise<Result<{ entityId: string; shortId: string }, MintNpcError>> {
  const parsed = MintNpcSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const minted = await mintNpc({
    campaignId: campaign.id,
    name: parsed.data.name,
  })
  revalidateCampaignWorld(campaign)
  return ok(minted)
}
