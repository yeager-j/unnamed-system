import { DAMAGE_TYPES } from "../affinity"
import type { HydratedSkill } from "../hydrated-character"
import type { SkillKind } from "../skill-kind"

/**
 * Display order for the Combat-tab Skills list (UNN-198): attackers should
 * find their offense lines first without scanning past Passives. Separate from
 * `SKILL_KINDS` in `../skill-kind.ts`, which is a vocabulary tuple and not
 * intended as a render order.
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

/** Damage-type-less skills (or unknown values like `"special"`) sort after
 *  every known damage type. */
const DAMAGE_TYPE_FALLBACK = DAMAGE_TYPES.length

function damageTypeRank(skill: HydratedSkill): number {
  if (skill.kind !== "attack") return DAMAGE_TYPE_FALLBACK
  const rank = DAMAGE_TYPE_INDEX[skill.damageType]
  return rank ?? DAMAGE_TYPE_FALLBACK
}

/**
 * Sorts the hydrated Skills the Combat tab renders. Primary: kind, per
 * {@link SKILL_KIND_DISPLAY_ORDER}. Secondary for attack Skills: damage type,
 * per {@link DAMAGE_TYPES} (slash → pierce → strike → fire → … → almighty).
 * Final tiebreaker: alphabetical by name. Pure — returns a new array and does
 * not mutate the input.
 */
export function sortSkillsByKind(skills: HydratedSkill[]): HydratedSkill[] {
  return [...skills].sort((a, b) => {
    const kindDelta = KIND_INDEX[a.kind] - KIND_INDEX[b.kind]
    if (kindDelta !== 0) return kindDelta
    const damageDelta = damageTypeRank(a) - damageTypeRank(b)
    if (damageDelta !== 0) return damageDelta
    return a.name.localeCompare(b.name)
  })
}
