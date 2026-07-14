import { z } from "zod/v4"

import { PARTICIPANT_KINDS } from "@/domain/planner/participant"

/**
 * Input schema for {@link import("./participant-preview").getParticipantPreviewAction}
 * (UNN-622): one chip pill's hover target.
 */
export const GetParticipantPreviewSchema = z.object({
  campaignId: z.string(),
  ref: z.object({ kind: z.enum(PARTICIPANT_KINDS), id: z.string() }),
})

export type GetParticipantPreviewInput = z.input<
  typeof GetParticipantPreviewSchema
>

export type GetParticipantPreviewError = "invalid-input" | "not-found"
