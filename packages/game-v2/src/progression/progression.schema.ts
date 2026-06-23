import { z } from "zod/v4"

import { PATH_CHOICES } from "@workspace/game-v2/kernel/vocab"

/**
 * The **Progression** component (D35) — the durable character facts derivation
 * reads together: `level` (1–30) and the permanent `pathChoice` (the HP/SP
 * scaling curve). Both are inputs to `resolve` (maxHP/maxSP, dice maxima,
 * attribute level scaling).
 *
 * Per D35 these are runtime **components**, not top-level entity fields (only
 * `id` is top-level). `level` is *also* a queryable DB column, lifted into this
 * component at load. **Dividend:** presence of `Progression` marks the
 * "derives-from-progression" (PC) case — an enemy carries no `Progression`
 * component at all, and the uniform fold (D37) handles both without a source fork.
 */
export const progressionSchema = z.object({
  level: z.number().int().min(1).max(30),
  pathChoice: z.enum(PATH_CHOICES),
})

export type Progression = z.infer<typeof progressionSchema>
