import { z } from "zod/v4"

import type { CharacterVirtuesPersistenceError } from "@/lib/db/character-virtues"

/**
 * Input schema for {@link setCharacterVirtuesAction}. Ranks are constrained
 * to {0, 1, 2} and the *upper* bounds of the rulebook 1.2 creation rule are
 * enforced (no two +2s, no three +1s) so a tampered payload can't smuggle a
 * stat overflow past the row.
 *
 * The full completeness check (exactly one +2 AND exactly two +1s) is *not*
 * enforced here — the wizard auto-saves intermediate states as the player
 * picks one Virtue at a time, and rejecting partial allocations would
 * silently drop every save until the player happens to hit the final shape.
 * The Character-Origins-step Next-button gate
 * (`nextGateForStep("character-origins")`) is the canonical completeness
 * check; this layer just keeps the row in a non-pathological state until
 * then.
 */
const rankSchema = z.union([z.literal(0), z.literal(1), z.literal(2)])

export const SetVirtuesSchema = z
  .object({
    characterId: z.string().min(1),
    expression: rankSchema,
    empathy: rankSchema,
    wisdom: rankSchema,
    focus: rankSchema,
    expectedVersion: z.number().int().nonnegative(),
  })
  .refine(
    ({ expression, empathy, wisdom, focus }) => {
      const ranks = [expression, empathy, wisdom, focus]
      const twos = ranks.filter((r) => r === 2).length
      const ones = ranks.filter((r) => r === 1).length
      return twos <= 1 && ones <= 2
    },
    { message: "At most one Virtue may be +2 and at most two may be +1." }
  )

export type SetVirtuesInput = z.input<typeof SetVirtuesSchema>

export type SetVirtuesError = "invalid-input" | CharacterVirtuesPersistenceError
