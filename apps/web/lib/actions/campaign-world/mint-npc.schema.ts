import { z } from "zod/v4"

import { displayNameSchema } from "../display-name.schema"

/**
 * Input schema for {@link import("./mint-npc").mintNpcAction} (UNN-575): the
 * quick-mint takes a name and nothing else — a fresh NPC is a stub by
 * construction (D2); traits and prose are authored later.
 */
export const MintNpcSchema = z.object({
  campaignId: z.string(),
  name: displayNameSchema,
  /** The tree folder it lands in; null/absent ⇒ Unfiled (D11). */
  folderId: z.string().nullish(),
})

export type MintNpcInput = z.input<typeof MintNpcSchema>

export type MintNpcError = "invalid-input" | "folder-not-found"
