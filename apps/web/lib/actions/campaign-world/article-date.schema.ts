import { z } from "zod/v4"

/**
 * Input schemas for {@link import("./article-date").setArticleDateAction} and
 * {@link import("./article-date").clearArticleDateAction} (D5): the dated
 * facet is `datedDay` + `datedKind` set-together; clearing drops both. A
 * resolved article refuses either (unbind the ⚑ marker first).
 */
export const SetArticleDateSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
  day: z.number().int().min(1).max(10_000),
  kind: z.enum(["event", "deadline"]),
})

export type SetArticleDateInput = z.input<typeof SetArticleDateSchema>

export const ClearArticleDateSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
})

export type ClearArticleDateInput = z.input<typeof ClearArticleDateSchema>

export type ArticleDateActionError =
  | "invalid-input"
  | "article-not-found"
  | "article-resolved"
