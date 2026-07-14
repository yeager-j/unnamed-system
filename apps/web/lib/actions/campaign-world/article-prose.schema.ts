import { z } from "zod/v4"

/**
 * Input schema for the Article prose autosave (D10). `name` allows empty —
 * the autosave lane must not reject a mid-edit cleared title (display falls
 * back to "Untitled article"); mint keeps `worldNameSchema.min(1)`.
 */
export const SaveArticleProseSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
  name: z.string().max(200).optional(),
  body: z.string().max(100_000).optional(),
  /** Set on the terminal (blur/unmount) save so the world route is revalidated — see the action. */
  revalidate: z.boolean().optional(),
})

export type SaveArticleProseInput = z.input<typeof SaveArticleProseSchema>

export type SaveArticleProseError = "invalid-input" | "article-not-found"

/** Input schema for the Article type set/clear (label-only tag). */
export const SetArticleTypeSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
  type: z.string().trim().min(1).max(100).nullable(),
})

export type SetArticleTypeInput = z.input<typeof SetArticleTypeSchema>

export type SetArticleTypeError = "invalid-input" | "article-not-found"
