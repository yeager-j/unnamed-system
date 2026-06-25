import { z } from "zod/v4"

import {
  attackRollSchema,
  rangeSchema,
} from "@workspace/game-v2/combat/attack.schema"
import {
  affinityEffectSchema,
  attackRollEffectSchema,
  attributeEffectSchema,
} from "@workspace/game-v2/kernel/effects.schema"
import { DAMAGE_TYPES } from "@workspace/game-v2/kernel/vocab/affinity"
import { DELIVERIES } from "@workspace/game-v2/kernel/vocab/attack"
import { ENCHANTMENT_TYPES } from "@workspace/game-v2/kernel/vocab/enchantment"

/**
 * The **interim** Skill shape, carried over from v1 `foundation/skills/schema.ts`
 * (D32) so the core builds + parity-tests against real numbers; the composed-Skill
 * model (mirroring `Item`) is a dedicated later phase (PR-S). Embeds re-point to
 * v2: `attackRoll`/`range` reuse the `combat` attack schema, `effects` reuse the
 * kernel effect primitives, `enchantment` the `kernel/vocab` Bard vocab. Kept
 * narrow on purpose — no new structure beyond v1's.
 *
 * **Interim note:** `key`/`skillKey` stay bare `string` (catalog-validated at load),
 * not the v1 `SkillKey` registry narrowing.
 */
const skillKey = z.string().regex(/^[a-z0-9-]+$/)

const costSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sp"), amount: z.number().int().positive() }),
  z.object({
    kind: z.literal("hp-percent"),
    amount: z.number().int().positive().max(100),
  }),
])

/** The damage type a Skill deals. `"special"` is the multi-element bucket. */
const damageTypeSchema = z.enum([...DAMAGE_TYPES, "special"])

/**
 * A Skill's structured, machine-readable modifiers — summed by the derived-value
 * engine for passive Skills while active. Distinct from the freeform `effect`
 * prose. Available on every kind for forward compatibility.
 */
const skillEffectsSchema = z.array(
  z.union([affinityEffectSchema, attributeEffectSchema, attackRollEffectSchema])
)

const baseFields = {
  key: skillKey,
  name: z.string().min(1),
  /** At-a-glance summary for the SkillRow preview (plain text). */
  tagline: z.string().min(1),
  /** Full Markdown description for the SkillCard popover. */
  description: z.string().min(1),
  /** Synthesis Skills are never inheritable; the picker excludes them. */
  isSynthesis: z.boolean(),
  /** The Skill's Effect block prose, if any (Markdown). */
  effect: z.string().min(1).optional(),
  /** Structured, machine-readable modifiers — see {@link skillEffectsSchema}. */
  effects: skillEffectsSchema.optional(),
  /** The Zone Enchantment this Skill creates when cast by a Bard. */
  enchantment: z.enum(ENCHANTMENT_TYPES).optional(),
}

export const attackSkillSchema = z.object({
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

/**
 * An Ailment Skill (e.g. Evil Touch) makes an Attack Roll but deals no damage —
 * each tier carries only Side Effects. `attackRoll` is required.
 */
export const ailmentSkillSchema = z.object({
  kind: z.literal("ailment"),
  ...baseFields,
  cost: costSchema,
  range: rangeSchema,
  attackRoll: attackRollSchema,
  targets: z.string().min(1).optional(),
})

const healSkillSchema = z.object({
  kind: z.literal("heal"),
  ...baseFields,
  cost: costSchema,
  range: rangeSchema,
  /** Heal amount formula; absent on cure-only Skills (Amrita Drop). */
  formula: z.string().min(1).optional(),
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
  ailmentSkillSchema,
])

export type SkillCost = z.infer<typeof costSchema>

/** A Skill's cost resolved to a concrete pool and integer amount. */
export type ResolvedSkillCost = { kind: "sp" | "hp"; amount: number }
export type AttackSkill = z.infer<typeof attackSkillSchema>
export type HealSkill = z.infer<typeof healSkillSchema>
export type SupportSkill = z.infer<typeof supportSkillSchema>
export type PassiveSkill = z.infer<typeof passiveSkillSchema>
export type AilmentSkill = z.infer<typeof ailmentSkillSchema>
export type Skill = z.infer<typeof skillSchema>

/** A Skill flagged as a Synthesis Skill (cooperative Rank-5, never inheritable). */
export type SynthesisSkill = Skill & { isSynthesis: true }

export const synthesisSkillSchema = skillSchema.refine(
  (skill) => skill.isSynthesis,
  { message: "A Synthesis Skill must have isSynthesis: true" }
)
