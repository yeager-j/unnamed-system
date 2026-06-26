import { resolveAttackRoll } from "@workspace/game-v2/combat/attack-roll"
import {
  resolveDamageBonuses,
  type DamageBonus,
} from "@workspace/game-v2/combat/damage-bonus"
import type { ScalerContext } from "@workspace/game-v2/combat/party"
import type { ResolvedAttackRoll } from "@workspace/game-v2/combat/resolved"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import { skillAttackRollContext } from "@workspace/game-v2/skills/attack-context"
import { resolveSkillCost } from "@workspace/game-v2/skills/cost"
import type {
  ResolvedSkillCost,
  Skill,
} from "@workspace/game-v2/skills/skill.schema"

/**
 * A catalog Skill resolved for display against a **live `ResolvedEntity`** — the v2
 * analog of v1's `HydratedSkill` (v2 `Skill` is flat, no hydrated variant). Its
 * cost (`hp-percent` resolved against the entity's `maxHP`) and Attack Roll / damage
 * bonuses (against the entity's resolved attributes + `pendingEffects`) reflect the
 * character's **current** resolved stats — C4 preserved, with no `StatContext`: the
 * combat resolvers already consume `ResolvedEntity` directly, so the archetype
 * display reads its inputs off the same resolved entity the sheet renders.
 *
 * A non-rolling Skill (flat damage / heal / buff / passive) carries no Attack Roll:
 * `resolvedAttackRoll` is `null` and `resolvedDamageBonuses` is empty.
 */
export interface ResolvedSkill {
  skill: Skill
  resolvedCost: ResolvedSkillCost | null
  resolvedAttackRoll: ResolvedAttackRoll | null
  resolvedDamageBonuses: DamageBonus[]
}

/** A {@link ResolvedSkill} tagged with the Archetype Rank it unlocks at (v1's `RankedSkill`). */
export type ResolvedArchetypeSkill = ResolvedSkill & { rank: number }

/**
 * Resolves one Skill against a {@link ResolvedEntity} + the encounter-scoped
 * {@link ScalerContext} (the casting side's party composition + the caster's active
 * Lineage, for the `perPartyLineage` self-exclusion). `scaler` is `null` off-combat,
 * collapsing every party scaler to 0.
 */
export function resolveSkill(
  skill: Skill,
  resolved: ResolvedEntity,
  scaler: ScalerContext | null
): ResolvedSkill {
  const maxHP = resolved.components.vitals?.maxHP ?? 0
  const context = skillAttackRollContext(skill)
  return {
    skill,
    resolvedCost: resolveSkillCost(skill, maxHP),
    resolvedAttackRoll: context
      ? resolveAttackRoll(context, resolved, scaler)
      : null,
    resolvedDamageBonuses: context
      ? resolveDamageBonuses(context, resolved)
      : [],
  }
}

/** {@link resolveSkill} tagged with the Archetype Rank `rank` it unlocks at. */
export function resolveArchetypeSkill(
  skill: Skill,
  rank: number,
  resolved: ResolvedEntity,
  scaler: ScalerContext | null
): ResolvedArchetypeSkill {
  return { ...resolveSkill(skill, resolved, scaler), rank }
}
