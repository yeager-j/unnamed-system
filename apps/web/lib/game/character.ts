import { z } from "zod/v4"
import { AFFINITIES, AFFINITY_DAMAGE_TYPES } from "./schema"

/**
 * Character-domain vocabulary and the value schemas for the structured
 * (JSON) parts of a character's persisted state. Kept out of the database
 * schema file so that module stays purely table/column definitions; the
 * `character*` tables import these for column typing and Server Action
 * validation.
 */

/**
 * The four Virtues. Separate from Attributes; used for social/exploration
 * checks and as Spark tags.
 */
export const VIRTUE_KEYS = ["expression", "empathy", "wisdom", "focus"] as const
export type VirtueKey = (typeof VIRTUE_KEYS)[number]

/**
 * HP/SP path chosen at creation. Determines starting HP/SP and the Hit/Skill
 * Die used at level-up (PRD §5.2, §7.4).
 */
export const PATH_CHOICES = [
  "health-focused",
  "balanced",
  "skill-focused",
] as const
export type PathChoice = (typeof PATH_CHOICES)[number]

/** The three equip slots plus a catch-all for unequippable items. */
export const ITEM_KINDS = ["weapon", "armor", "accessory", "other"] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

/** Per-axis Battle Condition state (Attack / Defense / Hit-Evasion). */
export const BATTLE_CONDITION_STATES = [
  "neutral",
  "increased",
  "decreased",
] as const
export type BattleConditionState = (typeof BATTLE_CONDITION_STATES)[number]

/**
 * Keys an equipment Attribute effect or permanent bonus can target: the four
 * Attributes plus the HP and SP pools.
 */
export const BONUS_TARGET_KEYS = [
  "hp",
  "sp",
  "strength",
  "magic",
  "agility",
  "luck",
] as const
export type BonusTargetKey = (typeof BONUS_TARGET_KEYS)[number]

/**
 * Permanent, source-agnostic bonuses (currently only Mastery at MVP). Sparse:
 * absent keys mean no bonus.
 */
export const permanentBonusesSchema = z.object({
  hp: z.number().int().optional(),
  sp: z.number().int().optional(),
  strength: z.number().int().optional(),
  magic: z.number().int().optional(),
  agility: z.number().int().optional(),
  luck: z.number().int().optional(),
})
export type PermanentBonuses = z.infer<typeof permanentBonusesSchema>

/** Ordered Spark log, each entry tagged with the Virtue that produced it. */
export const sparkLogSchema = z.array(z.enum(VIRTUE_KEYS)).max(7)
export type SparkLog = z.infer<typeof sparkLogSchema>

const battleConditionAxisSchema = z.object({
  state: z.enum(BATTLE_CONDITION_STATES),
  stacks: z.number().int().nonnegative(),
})

/** Tracked (not computed) combat modifiers; wiped by "Clear combat state". */
export const battleConditionsSchema = z.object({
  attack: battleConditionAxisSchema,
  defense: battleConditionAxisSchema,
  hitEvasion: battleConditionAxisSchema,
  charged: z.boolean(),
  concentrating: z.boolean(),
})
export type BattleConditions = z.infer<typeof battleConditionsSchema>

/**
 * Inheritance Slot configuration for one Archetype. `sourceCharacterArchetypeId`
 * points at the `characterArchetype` row the inherited Skill comes from; both
 * it and `skillKey` are null for an empty slot.
 */
export const inheritanceSlotsSchema = z.array(
  z.object({
    slotIndex: z.number().int().nonnegative(),
    sourceCharacterArchetypeId: z.string().nullable(),
    skillKey: z.string().nullable(),
  })
)
export type InheritanceSlots = z.infer<typeof inheritanceSlotsSchema>

const affinityEffectSchema = z.object({
  type: z.literal("affinity"),
  damageTypes: z.array(z.enum(AFFINITY_DAMAGE_TYPES)).min(1),
  affinity: z.enum(AFFINITIES),
})

const attributeEffectSchema = z.object({
  type: z.literal("attribute"),
  target: z.enum(BONUS_TARGET_KEYS),
  amount: z.number().int(),
})

const skillEffectSchema = z.object({
  type: z.literal("skill"),
  skillKey: z.string().min(1),
})

/** Any combination of Affinity / Attribute / Skill effects on an item. */
export const itemEffectsSchema = z.array(
  z.discriminatedUnion("type", [
    affinityEffectSchema,
    attributeEffectSchema,
    skillEffectSchema,
  ])
)
export type ItemEffects = z.infer<typeof itemEffectsSchema>

/** Advisory-length identity lists (Personality Traits, Hopes, Fears, Secrets). */
export const identityListSchema = z.array(z.string())
export type IdentityList = z.infer<typeof identityListSchema>

/**
 * Active Ailments, by key. Intentionally permissive: the app stores whatever
 * Ailments the player records and neither caps the count nor enforces
 * co-existence — the "one Ailment at a time (Downed may co-exist)" rule is
 * the DM's call at the table, not the app's. The 13-ailment value set lives
 * in hardcoded game data (added with the ailments module); entries are plain
 * strings until then.
 */
export const ailmentsSchema = z.array(z.string())
export type Ailments = z.infer<typeof ailmentsSchema>
