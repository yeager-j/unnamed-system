import { z } from "zod/v4"

/**
 * Input schema for {@link import("./delete-npc").deleteNpcAction} (UNN-575).
 * The `entityId` is validated against the gated campaign inside the write —
 * a forged or cross-campaign id reads as `"npc-not-found"`.
 */
export const DeleteNpcSchema = z.object({
  campaignId: z.string(),
  entityId: z.string(),
})

export type DeleteNpcInput = z.input<typeof DeleteNpcSchema>

export type DeleteNpcError = "invalid-input" | "npc-not-found"
