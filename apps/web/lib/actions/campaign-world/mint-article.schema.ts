import { z } from "zod/v4"

import { worldNameSchema } from "./mint-npc.schema"

/**
 * Input schema for {@link import("./mint-article").mintArticleAction}
 * (UNN-575). `type` is the label-only free-text tag (D4) — optional at mint;
 * the quick-mint rows omit it.
 */
export const MintArticleSchema = z.object({
  campaignId: z.string(),
  name: worldNameSchema,
  type: z.string().trim().min(1).max(100).optional(),
})

export type MintArticleInput = z.input<typeof MintArticleSchema>

export type MintArticleError = "invalid-input"
