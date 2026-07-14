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
import { revalidateCampaignWorld } from "./revalidate"

/**
 * The NPC prose autosave lane (D10): name + one narrative field per write,
 * LWW. Mid-edit debounce ticks **don't revalidate**; the **terminal
 * blur/unmount save sets `revalidate`** so the world route cache refreshes once
 * on leaving the field — otherwise a browser Back restores the stale pre-edit
 * RSC payload (UNN-621). Not the entity door — the DM authorizes through
 * `requireCampaignDM` here, while the door's identity-class gate stays the PC
 * owner's (see `saveNpcNarrativeField`'s doc).
 */
export async function saveNpcNameAction(
  input: SaveNpcNameInput
): Promise<Result<void, NpcProseError>> {
  const parsed = SaveNpcNameSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const { revalidate, ...write } = parsed.data
  const result = await saveNpcName({ ...write, campaignId: campaign.id })
  if (result.ok && revalidate) revalidateCampaignWorld(campaign)
  return result
}

export async function saveNpcNarrativeAction(
  input: SaveNpcNarrativeInput
): Promise<Result<void, NpcProseError>> {
  const parsed = SaveNpcNarrativeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const { revalidate, ...write } = parsed.data
  const result = await saveNpcNarrativeField({
    ...write,
    campaignId: campaign.id,
  })
  if (result.ok && revalidate) revalidateCampaignWorld(campaign)
  return result
}
