import { z } from "zod/v4"
import { DAMAGE_TYPES } from "../schema"

const skillKey = z.string().regex(/^[a-z0-9-]+$/)

/**
 * Damage delivery printed in parentheses after the damage type, e.g. the
 * "(Magical)" in "Fire (Magical)".
 */
export const DELIVERIES = ["physical", "magical"] as const
export type Delivery = (typeof DELIVERIES)[number]

/**
 * The attribute added to an Attack Roll. "st-or-ma" is the documented
 * either-or variant used by a handful of Skills.
 */
export const ATTACK_ATTRIBUTES = ["st", "ma", "ag", "st-or-ma"] as const
export type AttackAttribute = (typeof ATTACK_ATTRIBUTES)[number]

/**
 * Known Range values. Skills outside this set carry an explicit string via
 * the {@link rangeSchema} escape hatch so unusual ranges never block
 * transcription.
 */
export const RANGES = [
  "engaged",
  "all-engaged",
  "same-zone",
  "same-or-adjacent-zone",
] as const
export type Range = (typeof RANGES)[number]

const rangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("known"), value: z.enum(RANGES) }),
  z.object({ kind: z.literal("explicit"), value: z.string().min(1) }),
])

const costSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sp"), amount: z.number().int().positive() }),
  z.object({
    kind: z.literal("hp-percent"),
    amount: z.number().int().positive().max(100),
  }),
])

/**
 * The damage type a Skill deals. "special" is the multi-element bucket
 * (e.g. Elemental Apocalypse hits Fire/Ice/Elec/Wind on one card).
 */
const damageTypeSchema = z.enum([...DAMAGE_TYPES, "special"])

/**
 * One row of the Attack Roll table. `band` is free-form ("1-10", "16+",
 * "11-15"…) because the rulebook does not fix the boundaries.
 * `sideEffects` is ordered because a single band can carry several
 * (Shield Arts 20+ applies Sukunda *and* Critical).
 */
const attackTierSchema = z.object({
  band: z.string().min(1),
  formula: z.string().min(1),
  sideEffects: z.array(z.string().min(1)),
})

const attackRollSchema = z.object({
  attribute: z.enum(ATTACK_ATTRIBUTES),
  tiers: z.array(attackTierSchema),
})

const baseFields = {
  key: skillKey,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Synthesis Skills are never inheritable; the picker excludes them. */
  isSynthesis: z.boolean(),
  /**
   * The Skill's Effect block, if any. Archetype-scoped effects are folded
   * inline with a "(Mage Only) …" prefix; multiple blocks are newline-joined.
   */
  effect: z.string().min(1).optional(),
}

const attackSkillSchema = z.object({
  kind: z.literal("attack"),
  ...baseFields,
  cost: costSchema,
  range: rangeSchema,
  damageType: damageTypeSchema,
  delivery: z.enum(DELIVERIES),
  /** Multi-hit count, e.g. Tempest Slash "Hits: 3". */
  hits: z.number().int().positive().optional(),
  /** Inline header damage on Skills with no Attack Roll, e.g. "12d10". */
  damage: z.string().min(1).optional(),
  /** Absent on severe Skills that deal flat inline damage with no roll. */
  attackRoll: attackRollSchema.optional(),
  targets: z.string().min(1).optional(),
})

const healSkillSchema = z.object({
  kind: z.literal("heal"),
  ...baseFields,
  cost: costSchema,
  range: rangeSchema,
  /** Heal amount formula; absent on cure-only Skills (Amrita Drop). */
  damage: z.string().min(1).optional(),
  targets: z.string().min(1).optional(),
})

const supportSkillSchema = z.object({
  kind: z.literal("support"),
  ...baseFields,
  cost: costSchema,
  range: rangeSchema,
  /** Optional: Knight's Proclamation prints no Duration. */
  duration: z.number().int().positive().optional(),
  targets: z.string().min(1).optional(),
})

const passiveSkillSchema = z.object({
  kind: z.literal("passive"),
  ...baseFields,
})

export const skillSchema = z.discriminatedUnion("kind", [
  attackSkillSchema,
  healSkillSchema,
  supportSkillSchema,
  passiveSkillSchema,
])

export type SkillCost = z.infer<typeof costSchema>
export type SkillRange = z.infer<typeof rangeSchema>
export type AttackTier = z.infer<typeof attackTierSchema>
export type AttackSkill = z.infer<typeof attackSkillSchema>
export type HealSkill = z.infer<typeof healSkillSchema>
export type SupportSkill = z.infer<typeof supportSkillSchema>
export type PassiveSkill = z.infer<typeof passiveSkillSchema>
export type Skill = z.infer<typeof skillSchema>
