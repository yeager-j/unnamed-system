import { z } from "zod/v4"

/**
 * The beat prose autosave's patch: at least one content field. Bounds are
 * generous prose caps, not display rules — titles/taglines render truncated,
 * never rejected.
 */
export const SaveBeatProseSchema = z
  .object({
    campaignId: z.string(),
    beatId: z.string(),
    title: z.string().max(300).optional(),
    tagline: z.string().max(1_000).optional(),
    body: z.string().max(100_000).optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.tagline !== undefined ||
      input.body !== undefined,
    { message: "empty patch" }
  )
export type SaveBeatProseInput = z.input<typeof SaveBeatProseSchema>

export type SaveBeatProseError = "invalid-input" | "beat-not-found"
