import { z } from "zod/v4"

/** A world thing's display name — non-empty, sanely bounded. */
export const worldNameSchema = z.string().trim().min(1).max(200)

/**
 * Input schema for {@link import("./mint-npc").mintNpcAction} (UNN-575): the
 * quick-mint takes a name and nothing else — a fresh NPC is a stub by
 * construction (D2); traits and prose are authored later.
 */
export const MintNpcSchema = z.object({
  campaignId: z.string(),
  name: worldNameSchema,
})

export type MintNpcInput = z.input<typeof MintNpcSchema>

export type MintNpcError = "invalid-input"
