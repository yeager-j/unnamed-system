import { z } from "zod/v4"

/**
 * Input schema for {@link import("./rotate-join-token").rotateJoinTokenAction}
 * (UNN-329). Only the campaign id; the new token is minted server-side, never
 * supplied by the client.
 */
export const RotateJoinTokenSchema = z.object({
  campaignId: z.string(),
})

export type RotateJoinTokenInput = z.input<typeof RotateJoinTokenSchema>

export type RotateJoinTokenError = "invalid-input"
