import type { ScalerContext } from "@workspace/game-v2/combat/party"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import {
  resolveSkill,
  type ResolvedSkill,
} from "@workspace/game-v2/skills/resolved"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * A {@link ResolvedSkill} tagged with the Archetype Rank it unlocks at — the
 * archetype-specific variant of the general (entity-agnostic) `resolveSkill` in
 * `skills/`. Only the `rank` is archetype-domain; the resolution itself is shared
 * with any caster (v1's `RankedSkill`).
 */
export type ResolvedArchetypeSkill = ResolvedSkill & { rank: number }

/** {@link resolveSkill} tagged with the Archetype Rank `rank` it unlocks at. */
export function resolveArchetypeSkill(
  skill: Skill,
  rank: number,
  resolved: ResolvedEntity,
  scaler: ScalerContext | null
): ResolvedArchetypeSkill {
  return { ...resolveSkill(skill, resolved, scaler), rank }
}
