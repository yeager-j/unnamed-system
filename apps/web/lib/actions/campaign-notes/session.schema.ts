import { z } from "zod/v4"

/** A session folder's display name — non-empty, sanely bounded. */
export const sessionNameSchema = z.string().trim().min(1).max(200)

export const CreateSessionSchema = z.object({
  campaignId: z.string(),
  name: sessionNameSchema,
})
export type CreateSessionInput = z.input<typeof CreateSessionSchema>

export const RenameSessionSchema = z.object({
  campaignId: z.string(),
  sessionId: z.string(),
  name: sessionNameSchema,
})
export type RenameSessionInput = z.input<typeof RenameSessionSchema>

export const DeleteSessionSchema = z.object({
  campaignId: z.string(),
  sessionId: z.string(),
})
export type DeleteSessionInput = z.input<typeof DeleteSessionSchema>

export type SessionActionError = "invalid-input" | "session-not-found"
