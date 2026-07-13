import { z } from "zod/v4"

const bondTierSchema = z.number().int().min(0).max(4)

/**
 * Input schema for {@link import("./bond").setNpcBondTierAction} (UNN-581,
 * D8). `expectedTier` is the CAS token: the confirm surfaces render with the
 * server's current tier, so a double-confirm from two surfaces can never jump
 * two tiers — the second write reports `stale`.
 */
export const SetNpcBondTierSchema = z.object({
  campaignId: z.string(),
  entityId: z.string(),
  expectedTier: bondTierSchema,
  tier: bondTierSchema,
})

export type SetNpcBondTierInput = z.input<typeof SetNpcBondTierSchema>

export type SetNpcBondTierError = "invalid-input" | "npc-not-found" | "stale"
