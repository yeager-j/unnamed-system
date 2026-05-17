import { z } from "zod/v4"

/**
 * The eleven damage types that appear on an Archetype's Affinity chart.
 * Almighty is intentionally excluded here because it cannot be resisted and
 * therefore never has an Affinity chart entry.
 */
export const AFFINITY_DAMAGE_TYPES = [
  "slash",
  "pierce",
  "strike",
  "fire",
  "ice",
  "wind",
  "elec",
  "aether",
  "psy",
  "light",
  "dark",
] as const

/**
 * Every damage type a Skill can deal, including Almighty. Reused by downstream
 * game-data modules (e.g. Skills); the Affinity chart only keys off
 * {@link AFFINITY_DAMAGE_TYPES}.
 */
export const DAMAGE_TYPES = [...AFFINITY_DAMAGE_TYPES, "almighty"] as const

export const AFFINITIES = [
  "weak",
  "resist",
  "null",
  "repel",
  "drain",
  "neutral",
] as const

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

export type DamageType = (typeof DAMAGE_TYPES)[number]
export type AffinityDamageType = (typeof AFFINITY_DAMAGE_TYPES)[number]
export type Affinity = (typeof AFFINITIES)[number]
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
  synthesisSkill: skillReferenceSchema,
})

export type SkillReference = z.infer<typeof skillReferenceSchema>
export type ArchetypePrerequisite = z.infer<typeof archetypePrerequisiteSchema>
export type Mastery = z.infer<typeof masterySchema>
export type Archetype = z.infer<typeof archetypeSchema>

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
