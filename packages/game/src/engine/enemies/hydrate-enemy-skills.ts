import {
  attackRollEffectsFromSkills,
  resolveAttackRollFrom,
  skillAttackRollContext,
} from "@workspace/game/engine/combat/attack-roll"
import { type GameData } from "@workspace/game/engine/ports"
import { hydrateSkill } from "@workspace/game/engine/skills/utils"
import { type HydratedSkill } from "@workspace/game/foundation/character/hydrated-character"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

/**
 * Hydrates a catalog enemy's `skillKeys` into the {@link HydratedSkill} shape
 * the shared `SkillCard` renders — the enemy counterpart to the character
 * pipeline's skills map in `derive-hydrated-character`, called by
 * {@link import("../combatant/statblock").statblockFromEnemy}. The Attack Roll
 * resolves against the enemy's **flat** Attributes (a stat block has no Archetype
 * to derive scores from), folding in any Attack-Roll effects declared by the
 * enemy's own passive Skills. Enemies have no party/Lineage scalers, so a
 * scaler effect resolves to its fixed `amount` (or 0).
 *
 * Costs resolve against the enemy's `maxHP` to satisfy the {@link HydratedSkill}
 * type, but catalog enemies never pay Skill costs (no SP pool, full every
 * encounter), so the drawer renders these with the cost row suppressed.
 */
export function hydrateEnemySkills(
  enemy: EnemyDefinition,
  lookups: Pick<GameData, "getSkill">
): HydratedSkill[] {
  const skills = enemy.skillKeys.flatMap((key) => {
    const skill = lookups.getSkill(key)
    return skill ? [skill] : []
  })
  const effects = attackRollEffectsFromSkills(skills)

  return skills.map((skill) => {
    const context = skillAttackRollContext(skill)
    const resolvedAttackRoll = context
      ? resolveAttackRollFrom(
          context,
          enemy.attributes,
          effects,
          (effect) => effect.amount ?? 0
        )
      : null
    return hydrateSkill(skill, enemy.maxHP, resolvedAttackRoll)
  })
}
