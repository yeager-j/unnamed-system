/**
 * Lineage vocabulary, re-declared in v2 (D32). The tree-like Lineages that group
 * Archetypes. Kept zod-free; consuming schemas build their own `z.enum`.
 *
 * v1's per-Lineage starting-weapon table is intentionally NOT carried here — it
 * keys off a data-layer `WeaponKey`, so it re-homes alongside the `items` domain
 * when that PR lands, keeping kernel free of any data dependency.
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
