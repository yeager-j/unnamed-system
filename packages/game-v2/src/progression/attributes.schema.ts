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
 * The **Attributes** component (D34) — the base of an entity's attribute scores,
 * carrying its own value-provenance `source` (D5): `derived` (a PC's scores come
 * from its active Archetype + bonuses, computed by `resolve`) or `flat` (an
 * enemy's authored scores). No `StatProfile` aggregate — this stands alone.
 */
export const attributesSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("derived") }),
    z.object({ kind: z.literal("flat"), scores: attributeScoresSchema }),
  ]),
})

export type Attributes = z.infer<typeof attributesSchema>
