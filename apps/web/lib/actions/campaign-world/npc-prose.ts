"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  saveNpcName,
  saveNpcNarrativeField,
} from "@/lib/db/writes/campaign-world"

import {
  SaveNpcNameSchema,
  SaveNpcNarrativeSchema,
  type NpcProseError,
  type SaveNpcNameInput,
  type SaveNpcNarrativeInput,
} from "./npc-prose.schema"

/**
 * The NPC prose autosave lane (D10): name + one narrative field per write,
 * LWW, **no revalidation** (the article-prose reasoning). Not the entity
 * door — the DM authorizes through `requireCampaignDM` here, while the
 * door's identity-class gate stays the PC owner's (see
 * `saveNpcNarrativeField`'s doc).
 */
export async function saveNpcNameAction(
  input: SaveNpcNameInput
): Promise<Result<void, NpcProseError>> {
  const parsed = SaveNpcNameSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  return saveNpcName({ ...parsed.data, campaignId: campaign.id })
}

export async function saveNpcNarrativeAction(
  input: SaveNpcNarrativeInput
): Promise<Result<void, NpcProseError>> {
  const parsed = SaveNpcNarrativeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  return saveNpcNarrativeField({ ...parsed.data, campaignId: campaign.id })
}
