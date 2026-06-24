import { z } from "zod/v4"

import { resolveAttackAttribute } from "@workspace/game-v2/combat/attack-roll"
import {
  ATTACK_ATTRIBUTE_ABBREVIATIONS,
  ATTACK_ATTRIBUTES,
  type AttackAttribute,
} from "@workspace/game-v2/kernel/vocab/attack"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab/attributes"

/**
 * A damage **formula** as structured data — the ordered sum of additive
 * {@link FormulaTerm}s — replacing v1's free-form `"1d10 + St"` string. Because
 * the expression is data, the two operations a string forces into regex and
 * split/splice surgery become pure array ops: folding a damage bonus is an array
 * insert ({@link foldDamageBonuses}); hydrating Attribute references into scores is
 * a render-time substitution ({@link renderFormula}). Nothing is ever parsed.
 *
 * Signs are **not** stored on a term — they're derived when rendering: dice are
 * always added, a `flat` term carries a signed `amount`, and an `attribute` term's
 * sign follows its resolved score. So the single source of sign truth is the
 * renderer, and a negative contribution renders with the Unicode minus `−` in one
 * place.
 */
export const formulaTermSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dice"),
    count: z.number().int().positive(),
    sides: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("flat"), amount: z.number().int() }),
  z.object({
    kind: z.literal("attribute"),
    attribute: z.enum(ATTACK_ATTRIBUTES),
  }),
])
export type FormulaTerm = z.infer<typeof formulaTermSchema>

/** A damage expression: a non-empty ordered list of additive terms. */
export const damageFormulaSchema = z.array(formulaTermSchema).min(1)
export type DamageFormula = z.infer<typeof damageFormulaSchema>

/** Authoring helper — a `count`d`sides` dice term (e.g. `dice(1, 10)` ⇒ `1d10`). */
export const dice = (count: number, sides: number): FormulaTerm => ({
  kind: "dice",
  count,
  sides,
})

/** Authoring helper — a flat signed constant (e.g. `flat(1)` ⇒ `1`). */
export const flat = (amount: number): FormulaTerm => ({ kind: "flat", amount })

/** Authoring helper — an Attribute reference (e.g. `attr("st")` ⇒ `St`). */
export const attr = (attribute: AttackAttribute): FormulaTerm => ({
  kind: "attribute",
  attribute,
})

/**
 * Inserts bonus terms right after the leading (base) damage term, so they read
 * `1d10 + 3d4 + St` — dice grouped before the Attribute. Returns the formula
 * unchanged for an empty bonus list. A pure array op (no string surgery): the
 * structured replacement for v1's `foldDamageBonusesIntoFormula`.
 */
export function foldDamageBonuses(
  formula: DamageFormula,
  bonuses: readonly FormulaTerm[]
): DamageFormula {
  const [base, ...rest] = formula
  if (bonuses.length === 0 || base === undefined) return formula
  return [base, ...bonuses, ...rest]
}

/**
 * Renders a formula to its display string. With `attributes`, each `attribute`
 * term is **hydrated** to its concrete (signed) score (`"1d8 + Ma"` ⇒ `"1d8 +
 * 4"`); without them, it renders the Attribute's abbreviation. The leading term is
 * bare; every following term carries its sign (`" + X"`, or `" − X"` with the
 * Unicode minus for a negative flat amount / Attribute score). Replaces v1's
 * `hydrateFormula` regex + `formatSignedBonus`.
 */
export function renderFormula(
  formula: DamageFormula,
  attributes?: AttributeScores
): string {
  return formula
    .map((term, index) =>
      index === 0
        ? renderLeadingTerm(term, attributes)
        : renderTrailingTerm(term, attributes)
    )
    .join("")
}

/**
 * The compact standalone label for a single term — the badge a damage bonus shows
 * (`"+3d4"`, `"−2"`). Sign hugs the value (no surrounding spaces), unlike the
 * spaced joins {@link renderFormula} uses between terms.
 */
export function termLabel(
  term: FormulaTerm,
  attributes?: AttributeScores
): string {
  if (term.kind === "dice") return `+${term.count}d${term.sides}`
  const value = termValue(term, attributes)
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`
}

/** The signed numeric value of a non-dice term (an `attribute` term resolves to
 *  its score when `attributes` are given, else 0). */
function termValue(
  term: Exclude<FormulaTerm, { kind: "dice" }>,
  attributes?: AttributeScores
): number {
  if (term.kind === "flat") return term.amount
  return attributes ? resolveAttackAttribute(term.attribute, attributes) : 0
}

function renderLeadingTerm(
  term: FormulaTerm,
  attributes?: AttributeScores
): string {
  if (term.kind === "dice") return `${term.count}d${term.sides}`
  if (term.kind === "flat") return `${term.amount}`
  return attributes
    ? `${resolveAttackAttribute(term.attribute, attributes)}`
    : ATTACK_ATTRIBUTE_ABBREVIATIONS[term.attribute]
}

function renderTrailingTerm(
  term: FormulaTerm,
  attributes?: AttributeScores
): string {
  if (term.kind === "dice") return ` + ${term.count}d${term.sides}`
  if (term.kind === "attribute" && !attributes) {
    return ` + ${ATTACK_ATTRIBUTE_ABBREVIATIONS[term.attribute]}`
  }
  const value = termValue(term, attributes)
  return value < 0 ? ` − ${Math.abs(value)}` : ` + ${value}`
}
