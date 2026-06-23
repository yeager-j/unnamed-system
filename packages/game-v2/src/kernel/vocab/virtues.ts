/**
 * Virtue vocabulary, re-declared in v2 (D32). The four Virtues that drive Spark.
 * Kept zod-free; consuming schemas build their own `z.enum`.
 */
export const VIRTUE_KEYS = ["expression", "empathy", "wisdom", "focus"] as const

export type VirtueKey = (typeof VIRTUE_KEYS)[number]
