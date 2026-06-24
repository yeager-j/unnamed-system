import { z } from "zod/v4"

/**
 * The **SkillPool** component (D34/D37) — an entity's SP capability. Presence
 * makes an entity a `CastingCombatant` (carrying it *is* the capability — there is
 * no optional `maxSP?`, per D1/D34). `base` is the intrinsic base maxSP: `0` for a
 * PC (whose maxSP comes from the `Level`/`Path` formula layer), the authored maxSP
 * for an enemy. `resolve` folds `base` → path/level layer (if present) → SP bonuses into
 * the effective `maxSP`, uniformly (D37 — no `max: MaxSource` fork).
 *
 * `spSpent` (D9) is the depletion field: `currentSP = max(0, maxSP − spSpent)`.
 * SP has no over-max analogue to HP's Usury loan, but it mirrors the model —
 * over-spend floors the *derived* current at 0 without losing the stored count.
 * Defaults to `0` (full SP) so a pre-PR3 `{ base }` blob still loads (D3).
 */
export const skillPoolSchema = z.object({
  base: z.number().int(),
  spSpent: z.number().int().default(0),
})

export type SkillPool = z.infer<typeof skillPoolSchema>
