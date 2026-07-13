import { z } from "zod/v4"

/**
 * Input schema for {@link import("./story-tier").setStoryTierAction} (UNN-581,
 * D8). Story tier is 1–4 — the four Archetype tiers; there is no 0/locked
 * state, because a character's Origin Lineage is always open at Initiate.
 */
export const SetStoryTierSchema = z.object({
  campaignId: z.string(),
  storyTier: z.number().int().min(1).max(4),
  expectedVersion: z.number().int().min(0),
})

export type SetStoryTierInput = z.input<typeof SetStoryTierSchema>

export type SetStoryTierError = "invalid-input" | "clock-not-found" | "stale"
