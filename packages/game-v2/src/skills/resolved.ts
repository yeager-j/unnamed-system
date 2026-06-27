import { resolveAttackRoll } from "@workspace/game-v2/combat/attack-roll"
import {
  resolveDamageBonuses,
  type DamageBonus,
} from "@workspace/game-v2/combat/damage-bonus"
import type {
  PartyComposition,
  ScalerContext,
} from "@workspace/game-v2/combat/party"
import type { ResolvedAttackRoll } from "@workspace/game-v2/combat/resolved"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import { skillAttackRollContext } from "@workspace/game-v2/skills/attack-context"
import { resolveSkillCost } from "@workspace/game-v2/skills/cost"
import type {
  ResolvedSkillCost,
  Skill,
} from "@workspace/game-v2/skills/skill.schema"

/**
 * A catalog Skill resolved for display/use against a **live `ResolvedEntity`** — the
 * v2 analog of v1's `HydratedSkill` (v2 `Skill` is flat, no hydrated variant). Its
 * cost (`hp-percent` resolved against the entity's `maxHP`) and Attack Roll / damage
 * bonuses (against the entity's resolved attributes + `pendingEffects`) reflect that
 * entity's **current** resolved stats — C4 preserved, with no `StatContext`: the
 * combat resolvers already consume `ResolvedEntity` directly.
 *
 * Entity-agnostic — any caster (PC, enemy, NPC, summon) resolves a Skill the same
 * way, so this lives in `skills/`, not under any one capability domain. The
 * archetypes domain layers a Rank tag on top (`ResolvedArchetypeSkill`).
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

/**
 * **Hydrates** a collected set of Skills against a finished {@link ResolvedEntity} —
 * the second phase of the resolve→hydrate split. Where {@link resolveSkill} hydrates
 * one Skill, this maps a whole collection (the `collectSkills` output: intrinsic +
 * archetype kit + inheritance + equipment grants, deduped), so a caller resolves
 * costs/Attack Rolls against the entity's **final** stats in one pass.
 *
 * It takes the resolve `context` directly and assembles the {@link ScalerContext}
 * here — `partyComposition` off the context, `activeLineage` off `resolved` — so
 * callers forward `context` wholesale instead of hand-building a scaler (which had
 * the call site re-derive `activeLineage` out of the very `resolved` it also passes).
 * A new scaler-relevant context field is then wired in **one place**, here.
 *
 * Passive Skills hydrate harmlessly (a non-rolling Skill carries a `null` Attack Roll
 * and `null` cost), so the castable list and the passives render from one array — the
 * UI's "all skills in one place".
 */
export function hydrateSkills(
  skills: readonly Skill[],
  resolved: ResolvedEntity,
  context: { partyComposition?: PartyComposition | null }
): ResolvedSkill[] {
  const scaler: ScalerContext = {
    partyComposition: context.partyComposition ?? null,
    activeLineage: resolved.components.archetypes?.activeLineage ?? null,
  }
  return skills.map((skill) => resolveSkill(skill, resolved, scaler))
}
