import { z } from "zod/v4"
import { attackRollSchema, DELIVERIES, rangeSchema } from "../attack"
import { DAMAGE_TYPES } from "../affinity"

const skillKey = z.string().regex(/^[a-z0-9-]+$/)

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
export type AttackSkill = z.infer<typeof attackSkillSchema>
export type HealSkill = z.infer<typeof healSkillSchema>
export type SupportSkill = z.infer<typeof supportSkillSchema>
export type PassiveSkill = z.infer<typeof passiveSkillSchema>
export type Skill = z.infer<typeof skillSchema>

/**
 * A Skill flagged as a Synthesis Skill. Synthesis Skills are cooperative
 * Rank-5 Skills that can never be inherited; the Inheritance picker excludes
 * them. Structurally a {@link Skill} narrowed to `isSynthesis: true`.
 */
export type SynthesisSkill = Skill & { isSynthesis: true }

export const synthesisSkillSchema = skillSchema.refine(
  (skill) => skill.isSynthesis,
  { message: "A Synthesis Skill must have isSynthesis: true" }
)
