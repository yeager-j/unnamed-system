import { type WeaponKey } from "@workspace/game/data/items/registry"

/**
 * Lineage vocabulary shared across game-data domains (Archetypes, Skill
 * effects, party composition). A neutral primitives module — no domain owns
 * it, mirroring {@link ../combat/affinity} and {@link ../combat/attack}. Kept
 * zod-free; consuming schemas build their own `z.enum` from this tuple.
 *
 * Also owns the per-Lineage starting-weapon table consumed at character
 * finalization — it's a Lineage-keyed lookup with no other natural home.
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

/**
 * The starting weapon equipped on a character at finalization, keyed by the
 * Origin Archetype's Lineage (PRD §5.1 step 5 / §5.2 — "Equipment is not
 * chosen in the builder. The starting weapon is the canonical weapon for the
 * character's Origin Lineage; it can be customized from the live sheet after
 * creation.").
 *
 * Covers every Lineage that ships an Archetype at MVP (warrior / knight /
 * mage / healer / thief / warlock). The remaining {@link Lineage}s have no Archetypes to
 * select as Origin, so no character can finalize against them — the map is
 * `Partial` so a future Lineage that ships an Archetype before its canonical
 * starter weapon surfaces the structured `"no-starting-weapon-for-lineage"`
 * error rather than crashing or silently equipping nothing.
 */
export const LINEAGE_STARTING_WEAPON: Partial<Record<Lineage, WeaponKey>> = {
  warrior: "longsword",
  mage: "staff",
  healer: "censer",
  knight: "spear",
  thief: "dagger",
  warlock: "grimoire",
}

/**
 * Looks up the starting weapon key for a Lineage, or `null` when none is
 * defined yet. Callers (currently only the finalize Server Action) surface
 * the null case as a structured error.
 */
export function startingWeaponForLineage(lineage: Lineage): WeaponKey | null {
  return LINEAGE_STARTING_WEAPON[lineage] ?? null
}
