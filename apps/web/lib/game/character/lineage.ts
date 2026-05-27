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

/**
 * Per-Lineage hint that drives the Movement 1 Archetype grid's path-responsive
 * sort. Pure presentation: a Health-Focused player sees `'health'` Lineages
 * surfaced first, but every Lineage stays selectable regardless of Path —
 * an HP-Focused Mage is unusual but valid (ADR-002 §"Order — responsive to
 * Path"). No mechanical effect at runtime.
 *
 * The four shipping Lineages carry the assignments confirmed in UNN-215;
 * the remaining eight are placeholder-`'balanced'` until each Lineage's
 * mechanic ships (ADR-002 OQ #3 — game-design call).
 */
export const LINEAGE_SUGGESTED_PATH = {
  warrior: "health",
  mage: "skill",
  brawler: "balanced",
  knight: "health",
  healer: "balanced",
  thief: "balanced",
  berserker: "balanced",
  bard: "balanced",
  shapechanger: "balanced",
  hunter: "balanced",
  warlock: "balanced",
  summoner: "balanced",
} as const satisfies Record<Lineage, "health" | "balanced" | "skill">

export type SuggestedPath = (typeof LINEAGE_SUGGESTED_PATH)[Lineage]
