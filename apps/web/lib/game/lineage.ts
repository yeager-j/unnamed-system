/**
 * Lineage vocabulary shared across game-data domains (Archetypes, Skill
 * effects, party composition). A neutral primitives module — no domain owns
 * it, mirroring {@link ./affinity} and {@link ./attack}. Kept zod-free;
 * consuming schemas build their own `z.enum` from this tuple.
 */

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

export type Lineage = (typeof LINEAGES)[number]
