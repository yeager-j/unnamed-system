/**
 * Skill-kind vocabulary, re-declared in v2 (D32). Shared by Skill definitions
 * and Skill-targeting effect filters. Kept zod-free; consumers build their own
 * `z.enum` from this tuple.
 */
export const SKILL_KINDS = [
  "attack",
  "heal",
  "support",
  "passive",
  "ailment",
] as const

export type SkillKind = (typeof SKILL_KINDS)[number]
