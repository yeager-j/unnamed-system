/**
 * Skill-kind vocabulary shared by Skill definitions and Skill-targeting Effect
 * filters. A neutral primitives module so {@link ./effects} can filter on
 * `skillKinds` without importing the Skill schema (which would create a cycle:
 * the Skill schema imports effect schemas). Kept zod-free; consumers build
 * their own `z.enum` from this tuple.
 */

/**
 * Every kind a Skill discriminator can take. The Skill schema's
 * `kind: "attack" | "heal" | "support" | "passive" | "ailment"` is built from
 * this tuple via `z.literal`.
 */
export const SKILL_KINDS = [
  "attack",
  "heal",
  "support",
  "passive",
  "ailment",
] as const

export type SkillKind = (typeof SKILL_KINDS)[number]
