import { z } from "zod/v4"

import type { LevelingPersistenceError } from "@/lib/db/leveling"

/**
 * Input schemas for the header owner-mode progression controls (PRD §6.1 /
 * §7.4, UNN-157). Victories ± is a single-class write on `progressionVersion`;
 * level-up is the codebase's only cross-class write, conditioning on and
 * bumping both `progressionVersion` and `vitalsVersion` per the leveling
 * persistence wrapper.
 *
 * `amount` is bounded to `{-1, 1, 2}` so the wire only accepts Standard /
 * Heroic / Undo from the popover; arbitrary deltas would be a different
 * affordance.
 */

export const AwardVictoriesSchema = z.object({
  characterId: z.string().min(1),
  amount: z
    .number()
    .int()
    .refine((n) => n === 1 || n === 2 || n === -1, {
      message: "amount must be -1, 1, or 2",
    }),
  expectedVersion: z.number().int().nonnegative(),
})
export type AwardVictoriesInput = z.input<typeof AwardVictoriesSchema>

export const LevelUpSchema = z.object({
  characterId: z.string().min(1),
  expectedVersions: z.object({
    progression: z.number().int().nonnegative(),
    vitals: z.number().int().nonnegative(),
  }),
})
export type LevelUpInput = z.input<typeof LevelUpSchema>

export type AwardVictoriesActionError =
  | "invalid-input"
  | LevelingPersistenceError
export type LevelUpActionError = "invalid-input" | LevelingPersistenceError
