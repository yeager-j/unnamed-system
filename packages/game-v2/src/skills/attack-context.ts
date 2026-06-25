import type { AttackRollContext } from "@workspace/game-v2/combat/attack-roll"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * Derives the {@link AttackRollContext} for a Skill (the Skill→context bridge,
 * C11 — deferred here from PR7 since it reads the Skill shape). Returns `null` for
 * kinds that make no Attack Roll: passive/heal/support, or an attack Skill with no
 * `attackRoll` table (severe flat-damage Skills). An ailment Skill returns the
 * attribute-only arm (no `damageType`/`delivery`) — that absence is meaningful to
 * the filter (an axis whose context value is missing fails a present filter).
 */
export function skillAttackRollContext(skill: Skill): AttackRollContext | null {
  if (skill.kind === "attack" && skill.attackRoll) {
    return {
      kind: skill.kind,
      damageType: skill.damageType,
      delivery: skill.delivery,
      attribute: skill.attackRoll.attribute,
    }
  }
  if (skill.kind === "ailment") {
    return { kind: skill.kind, attribute: skill.attackRoll.attribute }
  }
  return null
}
