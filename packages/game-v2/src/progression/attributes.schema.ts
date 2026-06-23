import { z } from "zod/v4"

import { ATTRIBUTE_KEYS } from "@workspace/game-v2/kernel/vocab"

/** A full set of attribute scores, one signed integer per Attribute. */
export const attributeScoresSchema = z.object({
  strength: z.number().int(),
  magic: z.number().int(),
  agility: z.number().int(),
  luck: z.number().int(),
}) satisfies z.ZodType<Record<(typeof ATTRIBUTE_KEYS)[number], number>>

/**
 * The **Attributes** component (D34/D37) — an entity's **base** attribute scores:
 * the intrinsic floor before any layer applies. A PC carries zeros (its real
 * scores come from the `Archetypes` layer); an enemy carries its authored scores.
 * `resolve` folds `base` → archetype layer (if present) → effects → clamp,
 * uniformly for every entity — there is no `source: derived | flat` (D37: that tag
 * was redundant with component presence and forked the fold so a `flat` enemy was
 * immune to effects). No `StatProfile` aggregate — this stands alone.
 */
export const attributesSchema = z.object({
  base: attributeScoresSchema,
})

export type Attributes = z.infer<typeof attributesSchema>
