"use server"

import { err, ok, type Result } from "@workspace/result"

import type { ParticipantPreview } from "@/domain/planner/participant-preview"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadParticipantPreview } from "@/lib/db/queries/load-participant-preview"

import {
  GetParticipantPreviewSchema,
  type GetParticipantPreviewError,
  type GetParticipantPreviewInput,
} from "./participant-preview.schema"

/**
 * The chip pill's **hover-on-demand** read (UNN-622): a gated read action, same
 * parse → `requireCampaignDM` shape as a write and no revalidation because
 * nothing changed (the `loadChroniclePageAction` precedent — see
 * `lib/actions/CLAUDE.md`). Fetched once per target and cached client-side, so
 * a page full of chips costs nothing until a pointer lands on one.
 */
export async function getParticipantPreviewAction(
  input: GetParticipantPreviewInput
): Promise<Result<ParticipantPreview, GetParticipantPreviewError>> {
  const parsed = GetParticipantPreviewSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const preview = await loadParticipantPreview(campaign.id, parsed.data.ref)

  return preview === null ? err("not-found") : ok(preview)
}
