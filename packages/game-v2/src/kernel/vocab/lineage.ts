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

/**
 * Per-Lineage hint driving the path-responsive Archetype-grid sort and the
 * Atlas's `fits-path` recommendation bucket. Pure presentation: a Health-Focused
 * player sees `"health"` Lineages first, but every Lineage stays selectable
 * regardless of Path. Re-declared in v2 (D32) beside the `LINEAGES` it keys.
 */
export const LINEAGE_SUGGESTED_PATH = {
  warrior: "health",
  mage: "skill",
  brawler: "health",
  knight: "health",
  healer: "balanced",
  thief: "balanced",
  berserker: "health",
  bard: "skill",
  shapechanger: "skill",
  hunter: "balanced",
  warlock: "balanced",
  summoner: "skill",
} as const satisfies Record<Lineage, "health" | "balanced" | "skill">

export type SuggestedPath = (typeof LINEAGE_SUGGESTED_PATH)[Lineage]
