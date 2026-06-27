import {
  attr,
  dice,
  flat,
  type DamageFormula,
} from "@workspace/game-v2/combat/formula"

/**
 * The closed set of Attack-Roll tier damage formulas used by the ported v1 skill
 * catalog, **keyed by their v1 string** (`"1d8 + Ma"`). v1 authored tier formulas
 * as free-form strings; v2 stores them as structured {@link DamageFormula} terms
 * (so a damage bonus folds as an array insert, never string surgery). Centralising
 * the conversion here — rather than re-spelling `[dice(1, 8), attr("ma")]` at every
 * tier — keeps the catalog files a faithful 1:1 transcription of v1 (a reviewer
 * diffs `F["1d8 + Ma"]` against the v1 `formula: "1d8 + Ma"`) and makes the whole
 * conversion **correct by construction**: `formulas.test.ts` asserts every entry
 * round-trips (`renderFormula(F[k]) === k`), so a right key string ⇒ a right formula.
 */
export const F = {
  "1 + Ag": [flat(1), attr("ag")],
  "1 + St": [flat(1), attr("st")],
  "1d4 + Ag": [dice(1, 4), attr("ag")],
  "1d4 + Ma": [dice(1, 4), attr("ma")],
  "1d4 + St": [dice(1, 4), attr("st")],
  "1d6 + Ag": [dice(1, 6), attr("ag")],
  "1d6 + St": [dice(1, 6), attr("st")],
  "1d8 + Ag": [dice(1, 8), attr("ag")],
  "1d8 + Ma": [dice(1, 8), attr("ma")],
  "1d8 + St": [dice(1, 8), attr("st")],
  "1d10 + Ag": [dice(1, 10), attr("ag")],
  "1d10 + St": [dice(1, 10), attr("st")],
  "1d12 + Ma": [dice(1, 12), attr("ma")],
  "1d12 + St": [dice(1, 12), attr("st")],
  "2d8 + Ma": [dice(2, 8), attr("ma")],
} satisfies Record<string, DamageFormula>
