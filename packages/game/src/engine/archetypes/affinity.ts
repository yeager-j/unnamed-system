import { type Archetype } from "@workspace/game/foundation/archetypes/schema"
import {
  type Affinity,
  type DamageType,
} from "@workspace/game/foundation/combat/affinity"

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
