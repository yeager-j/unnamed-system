/**
 * Path vocabulary, re-declared in v2 (D32). A character's permanent build choice
 * that sets the HP/SP scaling curve. Kept zod-free; consuming schemas build their
 * own `z.enum`.
 */
export const PATH_CHOICES = [
  "health-focused",
  "balanced",
  "skill-focused",
] as const

export type PathChoice = (typeof PATH_CHOICES)[number]
