import type { AttackAttribute } from "./attack"
import type { AttributeScores } from "./stats"

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
    case "st-or-ma":
      return Math.max(attributes.strength, attributes.magic)
  }
}

/**
 * Substitutes Attribute abbreviations in a formula with the character's
 * concrete scores so an authored `"1d8 + Ma"` renders as `"1d8 + 4"`. Handles
 * a leading `+` / `-` operator so a negative score renders as `"− 1"` instead
 * of `"+ -1"`. The longer `"St or Ma"` pattern is replaced first so the bare
 * `"St"` / `"Ma"` rules don't match it twice.
 */
export function hydrateFormula(
  formula: string,
  attributes: AttributeScores
): string {
  return formula.replace(
    /\s*([+−-])\s*(St or Ma|St|Ma|Ag)\b/g,
    (_match, op: string, name: string) => {
      const base =
        name === "St or Ma"
          ? Math.max(attributes.strength, attributes.magic)
          : name === "St"
            ? attributes.strength
            : name === "Ma"
              ? attributes.magic
              : attributes.agility
      const signed = op === "+" ? base : -base
      return ` ${formatSignedBonus(signed)}`
    }
  )
}

export function formatSignedBonus(value: number): string {
  return value < 0 ? `− ${Math.abs(value)}` : `+ ${value}`
}
