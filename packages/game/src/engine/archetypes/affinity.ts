import { type Archetype } from "@workspace/game/foundation/archetypes/schema"
import {
  type Affinity,
  type DamageType,
} from "@workspace/game/foundation/combat/affinity"

/**
 * Resolves the effective Affinity an Archetype has to a damage type. Damage
 * types absent from the Archetype's chart are Neutral, and Almighty is always
 * Neutral because it cannot be resisted. The almighty guard is also load-bearing
 * for the type: the affinity chart (`affinityChartSchema`) has no `almighty`
 * key, so it narrows `damageType` off the union before the lookup below.
 */
export function resolveAffinity(
  archetype: Archetype,
  damageType: DamageType
): Affinity {
  // Stryker disable next-line ConditionalExpression,StringLiteral,BlockStatement: the StringLiteral/BlockStatement mutants are equivalent (almighty is absent from the chart, so skipping the guard falls through to "neutral" anyway); the ConditionalExpression `false` is likewise equivalent. (`ConditionalExpression true` is a real mutant the active-Archetype-switch affinity test catches, but Stryker's line-granular disable can't exclude it from the other two — same trade-off as the guards in combat/attack-roll.ts.)
  if (damageType === "almighty") {
    return "neutral"
  }

  return archetype.affinities[damageType] ?? "neutral"
}
