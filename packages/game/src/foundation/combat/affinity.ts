/**
 * Damage-type and Affinity vocabulary shared across game-data domains
 * (Archetypes, Skills, item effects). A neutral primitives module — no domain
 * owns it, mirroring {@link ../attack}. Kept zod-free; consuming schemas build
 * their own `z.enum` from these tuples.
 */

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
  "soul",
  "mind",
  "light",
  "dark",
] as const

/**
 * Every damage type a Skill can deal, including Almighty. The Affinity chart
 * only keys off {@link AFFINITY_DAMAGE_TYPES}.
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

export type DamageType = (typeof DAMAGE_TYPES)[number]
export type AffinityDamageType = (typeof AFFINITY_DAMAGE_TYPES)[number]
export type Affinity = (typeof AFFINITIES)[number]
