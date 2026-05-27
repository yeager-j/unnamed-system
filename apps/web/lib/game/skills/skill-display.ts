import type { AttributeScores } from "../character/stats/stats"
import type { AttackAttribute } from "../combat/attack"

/**
 * Substitution helpers that turn an authored damage/healing/Attack-Roll formula
 * like `"1d8 + Ma"` into a rendered `"1d8 + 4"` keyed off the character's
 * resolved Attribute scores. Extracted from the Skill card so the engine owns
 * the math and the component only renders; the same module supplies the base
 * Attack Roll bonus the Skill card pairs with mechanic contributions.
 */

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
