import { z } from "zod/v4"

import { maxSourceSchema } from "@workspace/game-v2/vitals/max-source.schema"

/**
 * The **SkillPool** component (D34) — an entity's SP capability. Presence makes
 * an entity a `CastingCombatant` (carrying it *is* the capability — there is no
 * optional `maxSP?`, per D1/D34). `max` is the ceiling's
 * {@link import("./max-source.schema").MaxSource}; `resolve` turns it into the
 * effective `maxSP`.
 *
 * PR2 ships only `max`. The depletion field (`spSpent`; `currentSP = max(0, maxSP
 * − spSpent)`) and its operations are PR3 (UNN-501).
 */
export const skillPoolSchema = z.object({
  max: maxSourceSchema,
})

export type SkillPool = z.infer<typeof skillPoolSchema>
