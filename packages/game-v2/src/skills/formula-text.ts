import { resolveAttackAttribute } from "@workspace/game-v2/combat/attack-roll"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import type { AttackAttribute } from "@workspace/game-v2/kernel/vocab/attack"

/**
 * Attribute-abbreviation substitution for the **flat string** `Skill.formula`
 * facet ("2d8 + Ma") — re-homed from v1's `hydrateFormula` (UNN-556). The
 * structured tier formulas render through `combat/formula`'s `renderFormula`;
 * this covers the authored magnitude strings the composed Skill shape kept as
 * plain text.
 */

const FORMULA_ATTRIBUTE_NAMES = [
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
 * Substitutes Attribute abbreviations in a formula with the entity's concrete
 * scores so an authored `"1d8 + Ma"` renders as `"1d8 + 4"`. Handles a leading
 * `+` / `-` operator so a negative score renders as `"− 1"` instead of
 * `"+ -1"`.
 */
export function hydrateFormulaText(
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

/** `+ 4` / `− 4` (Unicode minus) — the spaced signed-bonus display format. */
export function formatSignedBonus(value: number): string {
  return value < 0 ? `− ${Math.abs(value)}` : `+ ${value}`
}
