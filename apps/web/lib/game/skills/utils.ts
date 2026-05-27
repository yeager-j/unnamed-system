import {
  computeMaxHP,
  type AttributeScores,
  type HydratedSkill,
  type StatComputationCharacter,
} from "../character"
import { DAMAGE_TYPES, type AttackAttribute } from "../combat"
import type { SkillKind } from "../common"
import type { Skill } from "./schema"

/**
 * Display order for the Combat-tab Skills list (UNN-198): attackers should
 * find their offense lines first without scanning past Passives. Separate from
 * `SKILL_KINDS` in `./skill-kind`, which is a vocabulary tuple and not
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

/** A Skill's cost resolved to a concrete pool and integer amount. */
export type ResolvedSkillCost = { kind: "sp" | "hp"; amount: number }

/**
 * A {@link StatComputationCharacter} plus the two live, tracked combat pools.
 * `currentHP`/`currentSP` are mutable session state (not derived), so they
 * stay off the pure derived-value view and ride along here for the cast check.
 */
export interface CastingCharacter extends StatComputationCharacter {
  currentHP: number
  currentSP: number
}

/**
 * Resolves a Skill's cost for display and affordability checks. A flat SP cost
 * passes through unchanged; an HP-percentage cost resolves against the
 * character's current (derived) max HP, rounded down to an integer with a
 * floor of 1 (PRD §7.2, rulebook `3.3 On Your Turn` "Skill Costs"). The
 * floor-at-1 stops a Skill that declares a non-zero `hp-percent` cost from
 * resolving to a free cast at very low max HP — a Skill defined to cost HP
 * should always charge at least 1. Returns `null` for Skills with no cost
 * (passive Skills carry none), meaning there is nothing to pay.
 */
export function resolveSkillCost(
  skill: Skill,
  character: CastingCharacter
): ResolvedSkillCost | null {
  if (!("cost" in skill)) return null

  const { cost } = skill
  if (cost.kind === "sp") return { kind: "sp", amount: cost.amount }

  const maxHP = computeMaxHP(character)
  const amount = Math.max(1, Math.floor((maxHP * cost.amount) / 100))
  return { kind: "hp", amount }
}

/**
 * Whether the character can pay a Skill's resolved cost. SP costs need
 * `currentSP >= amount`; HP costs need `currentHP > amount` (strictly greater —
 * a Skill can never drop the caster to 0 HP, PRD §7.2). A costless Skill is
 * always castable.
 */
export function canCast(skill: Skill, character: CastingCharacter): boolean {
  const cost = resolveSkillCost(skill, character)
  if (cost === null) return true

  if (cost.kind === "sp") return character.currentSP >= cost.amount
  return character.currentHP > cost.amount
}

/**
 * Resolves an {@link AttackAttribute} symbol to the character's concrete
 * Attribute score. `"st-or-ma"` picks the higher of Strength and Magic per
 * the rulebook convention — the engine doesn't expose a separate "either"
 * stat.
 */
export function resolveAttackAttribute(
  attr: AttackAttribute,
  attributes: AttributeScores
): number {
  switch (attr) {
    case "st":
      return attributes.strength
    case "ma":
      return attributes.magic
    case "ag":
      return attributes.agility
    case "lu":
      return attributes.luck
    case "st-or-ma":
      return Math.max(attributes.strength, attributes.magic)
  }
}

/**
 * Maps the human-readable Attribute names used in authored formulas to their
 * {@link AttackAttribute} keys. Ordered longest-first so the regex prefers
 * `"St or Ma"` over the bare `"St"` / `"Ma"` that would otherwise match it
 * twice.
 */
const FORMULA_ATTRIBUTE_NAMES = [
  ["St or Ma", "st-or-ma"],
  ["St", "st"],
  ["Ma", "ma"],
  ["Ag", "ag"],
  ["Lu", "lu"],
] as const satisfies ReadonlyArray<readonly [string, AttackAttribute]>

const FORMULA_ATTRIBUTE_BY_NAME: Record<string, AttackAttribute> =
  Object.fromEntries(FORMULA_ATTRIBUTE_NAMES)

const FORMULA_PATTERN = new RegExp(
  `\\s*([+−-])\\s*(${FORMULA_ATTRIBUTE_NAMES.map(([name]) => name).join("|")})\\b`,
  "g"
)

/**
 * Substitutes Attribute abbreviations in a formula with the character's
 * concrete scores so an authored `"1d8 + Ma"` renders as `"1d8 + 4"`. Handles
 * a leading `+` / `-` operator so a negative score renders as `"− 1"` instead
 * of `"+ -1"`.
 */
export function hydrateFormula(
  formula: string,
  attributes: AttributeScores
): string {
  return formula.replace(
    FORMULA_PATTERN,
    (_match, op: string, name: string) => {
      const base = resolveAttackAttribute(
        FORMULA_ATTRIBUTE_BY_NAME[name]!,
        attributes
      )
      const signed = op === "+" ? base : -base
      return ` ${formatSignedBonus(signed)}`
    }
  )
}

export function formatSignedBonus(value: number): string {
  return value < 0 ? `− ${Math.abs(value)}` : `+ ${value}`
}
