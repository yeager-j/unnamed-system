"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { saveBeatProse } from "@/lib/db/writes/campaign-notes"

import {
  SaveBeatProseSchema,
  type SaveBeatProseError,
  type SaveBeatProseInput,
} from "./prose.schema"

/**
 * The beat prose autosave (UNN-576, D10): title/tagline/body land LWW, the
 * body re-derives the mention index in the same transaction — and there is
 * **deliberately no revalidation**: the editor is client-owned while mounted
 * (RSC seeds once; `MarkdownField` guards echo resets), and a per-debounce
 * revalidate would re-render the route under the typist. Structural writes
 * (`session.ts`/`beat.ts`/`schedule.ts`) revalidate instead.
 */
export async function saveBeatProseAction(
  input: SaveBeatProseInput
): Promise<Result<void, SaveBeatProseError>> {
  const parsed = SaveBeatProseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const { campaignId, beatId, title, tagline, body } = parsed.data
  const campaign = await requireCampaignDM(campaignId)
  return saveBeatProse({
    campaignId: campaign.id,
    beatId,
    patch: {
      ...(title !== undefined ? { title } : {}),
      ...(tagline !== undefined ? { tagline } : {}),
      ...(body !== undefined ? { body } : {}),
    },
  })
}
