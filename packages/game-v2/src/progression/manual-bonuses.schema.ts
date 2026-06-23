import { z } from "zod/v4"

/**
 * The **ManualBonuses** component (D35) — player-entered flat bonuses (from a
 * Background, a DM ruling, …) to the HP/SP pools and the four Attributes. Sparse:
 * an absent key means no bonus. One of the six bonus-pool sources `resolve`
 * sums; its own ad-hoc editor surface (hence its own component, not bundled).
 *
 * Mastery is **not** stored here — it derives from Archetype rank at resolve time
 * (the mastery walk) and sums on top of these.
 */
export const manualBonusesSchema = z.object({
  hp: z.number().int().optional(),
  sp: z.number().int().optional(),
  strength: z.number().int().optional(),
  magic: z.number().int().optional(),
  agility: z.number().int().optional(),
  luck: z.number().int().optional(),
})

export type ManualBonuses = z.infer<typeof manualBonusesSchema>
