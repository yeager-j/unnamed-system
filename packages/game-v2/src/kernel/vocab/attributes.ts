/**
 * Attribute vocabulary, re-declared in v2 (D32). The four core Attributes.
 * Kept zod-free; consuming schemas build their own `z.enum`.
 */
export const ATTRIBUTE_KEYS = ["strength", "magic", "agility", "luck"] as const

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number]

/** A full set of attribute scores — one signed integer per Attribute. */
export type AttributeScores = Record<AttributeKey, number>
