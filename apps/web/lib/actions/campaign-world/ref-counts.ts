"use server"

import { z } from "zod/v4"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { PARTICIPANT_KINDS } from "@/domain/planner/participant"
import type { ParticipantRefCounts } from "@/domain/planner/view/world-detail"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadParticipantRefCounts } from "@/lib/db/queries/load-world-web"

const LoadRefCountsSchema = z.object({
  campaignId: z.string(),
  ref: z.object({ kind: z.enum(PARTICIPANT_KINDS), id: z.string() }),
})

export type LoadRefCountsInput = z.input<typeof LoadRefCountsSchema>

export type LoadRefCountsError = "invalid-input"

/**
 * The delete confirm's **count-on-open** read (work item 5): the dialog
 * fetches honest reference counts when it opens instead of every sidebar
 * render precomputing them. A gated read behind an action — the one shape a
 * client component can call on demand without a route.
 */
export async function loadRefCountsAction(
  input: LoadRefCountsInput
): Promise<Result<ParticipantRefCounts, LoadRefCountsError>> {
  const parsed = LoadRefCountsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  return ok(await loadParticipantRefCounts(campaign.id, parsed.data.ref))
}
