/**
 * Damage-type and Affinity vocabulary, re-declared in v2 (D32 — v2 owns its own
 * vocab and imports nothing from v1). A neutral primitives module — no domain
 * owns it. Kept zod-free; consuming schemas build their own `z.enum` from these
 * tuples.
 */

/**
 * The eleven damage types that appear on an entity's Affinity chart. Almighty is
 * intentionally excluded here because it cannot be resisted and therefore never
 * has an Affinity chart entry.
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
 * Every damage type a Skill can deal, including Almighty. The Affinity chart only
 * keys off {@link AFFINITY_DAMAGE_TYPES}.
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

/**
 * A fully-resolved Affinity chart — every damage type (incl. Almighty) mapped to
 * an Affinity. The output of affinity resolution; an authored chart is sparser
 * (see {@link PartialAffinityChart}).
 */
export type AffinityChart = Record<DamageType, Affinity>

/**
 * An authored Affinity chart (an Archetype's or an enemy flat-profile's): only
 * the {@link AFFINITY_DAMAGE_TYPES} can be charted (Almighty can't be resisted),
 * and absent types mean Neutral. Resolution fills it into an {@link AffinityChart}.
 */
export type PartialAffinityChart = Partial<Record<AffinityDamageType, Affinity>>
