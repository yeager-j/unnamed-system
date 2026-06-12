import {
  attackRollEffectsFromSkills,
  resolveAttackRollFrom,
  skillAttackRollContext,
} from "@workspace/game/engine/combat/attack-roll"
import { type GameData } from "@workspace/game/engine/ports"
import {
  hydrateSkill,
  sortSkillsByKind,
} from "@workspace/game/engine/skills/utils"
import { type HydratedSkill } from "@workspace/game/foundation/character/hydrated-character"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

/**
 * Hydrates a catalog enemy's Skills into the {@link HydratedSkill} shape the
 * shared `SkillCard` renders — the enemy counterpart to the character pipeline's
 * skills map in `derive-hydrated-character`, called by
 * {@link import("../combatant/statblock").statblockFromEnemy}. An enemy's Skills
 * come from two sources, merged here: `skillKeys` (references resolved through
 * `getSkill`) and `inlineSkills` (full {@link import("@workspace/game/foundation/enemies/schema").EnemyDefinition}
 * Skills authored in place). The Attack Roll resolves against the enemy's
 * **flat** Attributes (a stat block has no Archetype to derive scores from),
 * folding in any Attack-Roll effects declared by the enemy's own passive Skills
 * across **both** sources. Enemies have no party/Lineage scalers, so a scaler
 * effect resolves to its fixed `amount` (or 0).
 *
 * The merged list is returned {@link sortSkillsByKind}-ordered (attacks before
 * passives) so the renderers — which map the list directly — show a coherent
 * order regardless of authoring order; sorting lives here, where the two sources
 * are merged, rather than in the renderer.
 *
 * Costs resolve against the enemy's `maxHP` to satisfy the {@link HydratedSkill}
 * type, but catalog enemies never pay Skill costs (no SP pool, full every
 * encounter), so the drawer renders these with the cost row suppressed.
 */
export function hydrateEnemySkills(
  enemy: EnemyDefinition,
  lookups: Pick<GameData, "getSkill">
): HydratedSkill[] {
  const referenced = enemy.skillKeys.flatMap((key) => {
    const skill = lookups.getSkill(key)
    return skill ? [skill] : []
  })
  const skills = [...referenced, ...(enemy.inlineSkills ?? [])]
  const effects = attackRollEffectsFromSkills(skills)

  const hydrated = skills.map((skill) => {
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

  return sortSkillsByKind(hydrated)
}
