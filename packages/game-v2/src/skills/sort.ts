import { DAMAGE_TYPES } from "@workspace/game-v2/kernel/vocab/affinity"
import type { SkillKind } from "@workspace/game-v2/kernel/vocab/skills"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"

/**
 * Display order for the Combat-tab Skills list (ported from v1
 * `engine/skills/utils.ts`, UNN-198): attackers should find their offense lines
 * first without scanning past Passives. Separate from `SKILL_KINDS` in
 * `kernel/vocab/skills` — that's a vocabulary tuple, not a render order.
 */
export const SKILL_KIND_DISPLAY_ORDER = [
  "attack",
  "heal",
  "ailment",
  "support",
  "passive",
] as const satisfies readonly SkillKind[]

const KIND_INDEX: Record<SkillKind, number> = Object.fromEntries(
  SKILL_KIND_DISPLAY_ORDER.map((kind, index) => [kind, index])
) as Record<SkillKind, number>

const DAMAGE_TYPE_INDEX: Record<string, number> = Object.fromEntries(
  DAMAGE_TYPES.map((type, index) => [type, index])
)

/** Skills with no damage type (heal/support/passive) and unknown values like
 *  `"special"` sort after every known damage type. */
const DAMAGE_TYPE_FALLBACK = DAMAGE_TYPES.length

function damageTypeRank(resolved: ResolvedSkill): number {
  const damageType = resolved.skill.damage?.damageType
  if (damageType === undefined) return DAMAGE_TYPE_FALLBACK
  return DAMAGE_TYPE_INDEX[damageType] ?? DAMAGE_TYPE_FALLBACK
}

/**
 * Sorts the {@link ResolvedSkill}s the Combat tab renders. Primary: kind, per
 * {@link SKILL_KIND_DISPLAY_ORDER}. Secondary for damaging Skills: damage type,
 * per {@link DAMAGE_TYPES} (slash → pierce → strike → fire → … → almighty).
 * Final tiebreaker: alphabetical by name. Pure — returns a new array and does
 * not mutate the input.
 */
export function sortSkillsByKind(
  skills: readonly ResolvedSkill[]
): ResolvedSkill[] {
  return [...skills].sort((a, b) => {
    const kindDelta = KIND_INDEX[a.skill.kind] - KIND_INDEX[b.skill.kind]
    if (kindDelta !== 0) return kindDelta
    const damageDelta = damageTypeRank(a) - damageTypeRank(b)
    if (damageDelta !== 0) return damageDelta
    return a.skill.name.localeCompare(b.skill.name)
  })
}
