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
import { SKILL_KINDS } from "@workspace/game-v2/kernel/vocab/skills"

/**
 * The **composed Skill** shape (PR-S / UNN-506), mirroring the already-composed
 * `Item` (`items/item.schema.ts`): a flat base plus **orthogonal optional
 * capability facets** that compose independently of `kind`, narrowed by presence
 * guards — replacing v1's `kind`-discriminated union.
 *
 * The v1 union fused two orthogonal axes: **resolution** (a flat `formula` vs. a
 * tiered `attackRoll`) and **payload/intent** (typed damage / healing / ailment
 * side effects / buff). The rulebook proves they don't partition — Evil Touch is a
 * Support Skill that *makes an Attack Roll* whose tiers inflict an ailment and
 * carries a duration; an attack tier already separates magnitude (`formula`) from
 * `sideEffects`. So `attackRoll` is a generic resolver available to **any** Skill,
 * and `kind` is demoted to an authored **intent tag** — display, grouping, and the
 * `skillKinds` Attack-Roll filter axis (which capability presence can't
 * reconstruct: a formula-less heal and a duration-less support are structurally
 * identical). Embeds re-point to v2: `attackRoll`/`range` reuse the `combat` attack
 * schema, `effects` the kernel effect primitives, `enchantment` the Bard vocab.
 *
 * **Healing stays untyped magnitude** (a `formula`, or `attackRoll` tiers for a
 * rolled heal) — it is *not* a damage type. The vitals layer already unifies
 * damage+heal as one signed depletion axis (D9/D10) and the `drain` affinity models
 * "damage that heals" as a polarity flip; a unified harm/restore HP-effect primitive
 * is deferred to the combat damage-resolution layer.
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
 * prose. Available on every Skill for forward compatibility.
 */
const skillEffectsSchema = z.array(
  z.union([affinityEffectSchema, attributeEffectSchema, attackRollEffectSchema])
)

/**
 * The **typed-damage** facet: how a damage-dealing Skill's magnitude is typed for
 * Affinity. Present iff the Skill deals typed damage (absent on heals, ailments,
 * buffs). `hits` is the multi-hit count, e.g. Tempest Slash "Hits: 3".
 */
const damageSpecSchema = z.object({
  damageType: damageTypeSchema,
  delivery: z.enum(DELIVERIES),
  hits: z.number().int().positive().optional(),
})

/**
 * Every Skill is one `Skill`; its **capabilities compose** rather than partitioning
 * Skills into mutually-exclusive kinds:
 *
 * - **castable** — carries a {@link costSchema cost} (with the `range`/`targets`
 *   it's cast at). Absent ⇒ passive.
 * - **rolled** — carries an {@link attackRollSchema attackRoll} (any Skill may roll;
 *   the tiers carry a `formula` and/or `sideEffects`).
 * - **magnitude** — a flat `formula` for Skills that don't roll.
 * - **typed-damage** — a {@link damageSpecSchema damage} spec when it deals
 *   Affinity-relevant damage.
 * - **buff** — a `duration`.
 *
 * The facets are orthogonal, so a rolled heal or an Attack-Roll Support Skill (Evil
 * Touch) needs no new kind.
 */
export const skillSchema = z.object({
  key: skillKey,
  /**
   * The Skill's intent category — display, grouping, and the `skillKinds`
   * Attack-Roll filter axis. An authored tag, **not** a structural discriminant.
   */
  kind: z.enum(SKILL_KINDS),
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

  // — castable facet (absent ⇒ passive) —
  cost: costSchema.optional(),
  range: rangeSchema.optional(),
  targets: z.string().min(1).optional(),

  // — resolution facet: a tiered d20 Attack Roll, available to ANY Skill —
  attackRoll: attackRollSchema.optional(),

  // — magnitude + typing facets —
  /**
   * Flat magnitude for a Skill that does not roll: a damage string ("12d10") or a
   * heal formula ("2d8 + Ma"). A rolled Skill carries its magnitude in the tiers.
   */
  formula: z.string().min(1).optional(),
  /** Typed-damage facet — see {@link damageSpecSchema}. */
  damage: damageSpecSchema.optional(),

  // — buff facet —
  /** Buff duration in rounds; absent when the Skill prints no Duration. */
  duration: z.number().int().positive().optional(),
})

export type SkillCost = z.infer<typeof costSchema>

/** A Skill's cost resolved to a concrete pool and integer amount. */
export type ResolvedSkillCost = { kind: "sp" | "hp"; amount: number }
export type DamageSpec = z.infer<typeof damageSpecSchema>
export type Skill = z.infer<typeof skillSchema>

/** A castable Skill — carries a {@link SkillCost} (the `isCastable` narrowing). */
export type CastableSkill = Skill & { cost: SkillCost }
/** A passive Skill — its `kind` intent tag is `"passive"`; never cast. */
export type PassiveSkill = Skill & { kind: "passive" }
/** A Skill flagged as a Synthesis Skill (cooperative Rank-5, never inheritable). */
export type SynthesisSkill = Skill & { isSynthesis: true }

export const synthesisSkillSchema = skillSchema.refine(
  (skill) => skill.isSynthesis,
  { message: "A Synthesis Skill must have isSynthesis: true" }
)

// — presence guards (mirror items' isEquippable / isItemForSlot / isConsumable) —

/** Whether the Skill can be cast (carries a {@link SkillCost}). */
export function isCastable(skill: Skill): skill is CastableSkill {
  return skill.cost !== undefined
}

/** Whether the Skill is a passive (its intent tag is `"passive"`; never cast). */
export function isPassive(skill: Skill): skill is PassiveSkill {
  return skill.kind === "passive"
}

/** Whether the Skill makes an Attack Roll (carries a tiered {@link attackRollSchema}). */
export function hasAttackRoll(skill: Skill): boolean {
  return skill.attackRoll !== undefined
}

/** Whether the Skill deals typed (Affinity-relevant) damage. */
export function dealsTypedDamage(skill: Skill): boolean {
  return skill.damage !== undefined
}
