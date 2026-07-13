import { z } from "zod/v4"

/** Input schema for {@link import("./lineage-gating").setLineageGatingAction} (UNN-581). */
export const SetLineageGatingSchema = z.object({
  campaignId: z.string(),
  enabled: z.boolean(),
})

export type SetLineageGatingInput = z.input<typeof SetLineageGatingSchema>

export type SetLineageGatingError = "invalid-input"
