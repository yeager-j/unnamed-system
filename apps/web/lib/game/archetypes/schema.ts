import { z } from "zod/v4"
import {
  AFFINITIES,
  type Affinity,
  type DamageType,
} from "../affinity"
import type { SkillKey } from "../skills"
import type { TalentKey } from "../talents"

/**
 * Archetype tiers. Only "initiate" ships at MVP; the full set is kept because
 * tiers are a fixed, documented game concept.
 */
export const ARCHETYPE_TIERS = [
  "initiate",
  "adept",
  "elite",
  "paragon",
] as const

/**
 * The tree-like Lineages that group Archetypes. Every Archetype belongs to
 * exactly one Lineage; higher-tier Archetypes share their Lineage with the
 * lower-tier Archetype they advance from.
 */
export const LINEAGES = [
  "warrior",
  "mage",
  "brawler",
  "knight",
  "healer",
  "thief",
  "berserker",
  "bard",
  "shapechanger",
  "hunter",
  "warlock",
  "summoner",
] as const

export const ATTRIBUTE_KEYS = ["strength", "magic", "agility", "luck"] as const

export type ArchetypeTier = (typeof ARCHETYPE_TIERS)[number]
export type Lineage = (typeof LINEAGES)[number]
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number]

const attributeScore = z.number().int().min(-7).max(7)

const archetypeKey = z.string().regex(/^[a-z0-9-]+$/)

const archetypeRank = z.number().int().min(1).max(5)

const skillReferenceSchema = z.object({
  rank: archetypeRank,
  skill: z.string().min(1),
})

/**
 * A requirement that another Archetype be at a given Rank before this
 * Archetype can be unlocked, e.g. `{ archetype: "knight", rank: 5 }`. The
 * referenced Archetype need not exist in the shipped data (prerequisites are
 * display-only at MVP).
 */
const archetypePrerequisiteSchema = z.object({
  archetype: archetypeKey,
  rank: archetypeRank,
})

const affinity = z.enum(AFFINITIES)

const affinityChartSchema = z.object({
  slash: affinity.optional(),
  pierce: affinity.optional(),
  strike: affinity.optional(),
  fire: affinity.optional(),
  ice: affinity.optional(),
  wind: affinity.optional(),
  elec: affinity.optional(),
  aether: affinity.optional(),
  psy: affinity.optional(),
  light: affinity.optional(),
  dark: affinity.optional(),
})

const masterySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hp"), amount: z.number().int() }),
  z.object({ kind: z.literal("sp"), amount: z.number().int() }),
  z.object({
    kind: z.literal("attribute"),
    amount: z.number().int(),
    attribute: z.enum(ATTRIBUTE_KEYS),
  }),
])

export const archetypeSchema = z.object({
  key: archetypeKey,
  name: z.string().min(1),
  lineage: z.enum(LINEAGES),
  tier: z.enum(ARCHETYPE_TIERS),
  prerequisites: z.array(archetypePrerequisiteSchema),
  inheritanceSlots: z.number().int().nonnegative(),
  talents: z.array(z.string()),
  mastery: masterySchema,
  attributes: z.object({
    strength: attributeScore,
    magic: attributeScore,
    agility: attributeScore,
    luck: attributeScore,
  }),
  affinities: affinityChartSchema,
  skills: z.array(skillReferenceSchema),
  /**
   * The Archetype's Rank-5 Synthesis Skill. Synthesis Skills cannot be
   * inherited. Optional because not every Archetype lists one.
   */
  synthesisSkill: skillReferenceSchema.optional(),
})

export type SkillReference = Omit<
  z.infer<typeof skillReferenceSchema>,
  "skill"
> & { skill: SkillKey }
export type ArchetypePrerequisite = z.infer<typeof archetypePrerequisiteSchema>
export type Mastery = z.infer<typeof masterySchema>

/**
 * The Archetype shape with cross-references narrowed to keys that exist in the
 * shipped catalog: `skills`/`synthesisSkill` to {@link SkillKey}, `talents` to
 * {@link TalentKey}. The Zod schema stays structural (plain strings); the
 * narrowing is enforced at compile time on the hardcoded data
 * (`satisfies Archetype`) and at load time by the index validator.
 * `prerequisites` stays loose — it may reference Archetypes not shipped at MVP.
 */
export type Archetype = Omit<
  z.infer<typeof archetypeSchema>,
  "skills" | "synthesisSkill" | "talents"
> & {
  skills: SkillReference[]
  synthesisSkill?: SkillReference
  talents: TalentKey[]
}

/**
 * Resolves the effective Affinity an Archetype has to a damage type. Damage
 * types absent from the Archetype's chart are Neutral, and Almighty is always
 * Neutral because it cannot be resisted.
 */
export function resolveAffinity(
  archetype: Archetype,
  damageType: DamageType
): Affinity {
  if (damageType === "almighty") {
    return "neutral"
  }

  return archetype.affinities[damageType] ?? "neutral"
}

/**
 * The Archetype Rank at which a character permanently gains that Archetype's
 * Mastery bonus (PRD §7.1). It equals the max Rank, so Mastery is simply
 * "at cap"; it is derived from Rank, never stored.
 */
export const MASTERY_RANK = 5

/**
 * Whether an Archetype at the given Rank has unlocked its Mastery bonus.
 * Mastery is automatic at {@link MASTERY_RANK}; the player makes no choice.
 */
export function hasMasteryBonus(rank: number): boolean {
  return rank >= MASTERY_RANK
}
