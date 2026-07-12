import { z } from "zod/v4"

/**
 * Input schema for {@link import("./delete-article").deleteArticleAction}
 * (UNN-575). The `articleId` is validated against the gated campaign inside
 * the write — a forged or cross-campaign id reads as `"article-not-found"`.
 */
export const DeleteArticleSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
})

export type DeleteArticleInput = z.input<typeof DeleteArticleSchema>

export type DeleteArticleError = "invalid-input" | "article-not-found"
