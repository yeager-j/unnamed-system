import { z } from "zod/v4"

import { LINEAGES } from "@workspace/game-v2/kernel/vocab"

/**
 * Input schemas for the NPC trait pickers (UNN-579, D8): Arcana is a free-text
 * narrative label (the picker offers the curated 22, the column tolerates
 * anything); Lineage is typed off the kernel vocab and hard-unique per
 * campaign.
 */
export const SetNpcArcanaSchema = z.object({
  campaignId: z.string(),
  entityId: z.string(),
  arcana: z.string().trim().min(1).max(100).nullable(),
})

export const SetNpcLineageSchema = z.object({
  campaignId: z.string(),
  entityId: z.string(),
  lineageKey: z.enum(LINEAGES).nullable(),
})

export type SetNpcArcanaInput = z.input<typeof SetNpcArcanaSchema>
export type SetNpcLineageInput = z.input<typeof SetNpcLineageSchema>

export type SetNpcArcanaError = "invalid-input" | "npc-not-found"
export type SetNpcLineageError = SetNpcArcanaError | "lineage-taken"
