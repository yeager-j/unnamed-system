import { describe, expect, it } from "vitest"

import { F } from "@workspace/game-v2/catalog/skills/formulas"
import { renderFormula } from "@workspace/game-v2/combat/formula"

/**
 * The conversion gate for the ported v1 catalog: every {@link F} entry must render
 * back to the v1 string it is keyed by. With this green, a catalog tier that
 * references `F["1d8 + Ma"]` is correct as long as the key matches the v1
 * `formula: "1d8 + Ma"` — a 1:1 transcription a diff verifies. So the structured
 * formulas never drift from the strings they were ported from.
 */
describe("F — every tier formula round-trips to its v1 string", () => {
  it.each(Object.keys(F))("renders %s", (key) => {
    expect(renderFormula(F[key as keyof typeof F])).toBe(key)
  })
})
