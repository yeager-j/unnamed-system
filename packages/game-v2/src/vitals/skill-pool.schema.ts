import { z } from "zod/v4"

/**
 * The **SkillPool** component (D34/D37) — an entity's SP capability. Presence
 * makes an entity a `CastingCombatant` (carrying it *is* the capability — there is
 * no optional `maxSP?`, per D1/D34). `base` is the intrinsic base maxSP: `0` for a
 * PC (whose maxSP comes from the `Progression` layer), the authored maxSP for an
 * enemy. `resolve` folds `base` → progression layer (if present) → SP bonuses into
 * the effective `maxSP`, uniformly (D37 — no `max: MaxSource` fork).
 *
 * PR2 ships only `base`. The depletion field (`spSpent`; `currentSP = max(0, maxSP
 * − spSpent)`) and its operations are PR3 (UNN-501).
 */
export const skillPoolSchema = z.object({
  base: z.number().int(),
})

export type SkillPool = z.infer<typeof skillPoolSchema>
