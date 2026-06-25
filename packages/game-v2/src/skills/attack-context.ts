import type { AttackRollContext } from "@workspace/game-v2/combat/attack-roll"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * Derives the {@link AttackRollContext} for a Skill (the Skill→context bridge,
 * C11). Capability-driven: a context exists iff the Skill **makes an Attack Roll**
 * (`attackRoll` present) — so a flat-damage Skill, a heal, a buff, or a passive all
 * return `null`. When the Skill also **deals typed damage** (`damage` present) the
 * `damageType`/`delivery` axes are included; otherwise (a rolled ailment / Evil
 * Touch) they are **omitted entirely** — that absence is meaningful to the filter
 * (an axis whose context value is missing fails a present filter), so the keys must
 * not appear even as `undefined`.
 */
export function skillAttackRollContext(skill: Skill): AttackRollContext | null {
  if (!skill.attackRoll) return null
  const { attribute } = skill.attackRoll
  if (!skill.damage) return { kind: skill.kind, attribute }
  return {
    kind: skill.kind,
    damageType: skill.damage.damageType,
    delivery: skill.damage.delivery,
    attribute,
  }
}
