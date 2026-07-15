import { z } from "zod/v4"

/**
 * Input schemas for {@link import("./article-date").setArticleDateAction} and
 * {@link import("./article-date").clearArticleDateAction} (D5): the inline
 * dated facet is **deadline-only** (UNN-627) — `datedDay` + `datedKind =
 * 'deadline'` set-together; clearing drops both. Events fan across days via the
 * event-placement actions instead. A resolved article refuses either (unbind
 * the ⚑ marker first).
 */
export const SetArticleDateSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
  day: z.number().int().min(1).max(10_000),
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
