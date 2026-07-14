"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { saveBeatProse } from "@/lib/db/writes/campaign-notes"

import {
  SaveBeatProseSchema,
  type SaveBeatProseError,
  type SaveBeatProseInput,
} from "./prose.schema"
import { revalidateCampaignNotes } from "./revalidate"

/**
 * The beat prose autosave (UNN-576, D10): title/tagline/body land LWW, the
 * body re-derives the mention index in the same transaction. Mid-edit debounce
 * ticks **don't revalidate** (a revalidate per ~800 ms would re-render the
 * route under the typist); the **terminal blur/unmount save sets `revalidate`**
 * so the notes route cache is refreshed once on leaving the field — otherwise
 * a browser Back restores the stale pre-edit RSC payload (UNN-621). This is
 * safe because the CM6 editor seeds once and ignores `serverValue` after mount,
 * so the revalidation can't trample a live draft.
 */
export async function saveBeatProseAction(
  input: SaveBeatProseInput
): Promise<Result<void, SaveBeatProseError>> {
  const parsed = SaveBeatProseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const { campaignId, beatId, title, tagline, body, revalidate } = parsed.data
  const campaign = await requireCampaignDM(campaignId)
  const result = await saveBeatProse({
    campaignId: campaign.id,
    beatId,
    patch: {
      ...(title !== undefined ? { title } : {}),
      ...(tagline !== undefined ? { tagline } : {}),
      ...(body !== undefined ? { body } : {}),
    },
  })
  if (result.ok && revalidate) revalidateCampaignNotes(campaign)
  return result
}
