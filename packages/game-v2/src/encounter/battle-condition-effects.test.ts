import { describe, expect, it } from "vitest"

import { hitEvasionAttackRollEffects } from "./battle-condition-effects"

describe("hitEvasionAttackRollEffects — Hit/Evasion → outgoing Attack Roll (3.8)", () => {
  it("Increased confers +3 to Attack Rolls, labelled for the breakdown", () => {
    expect(hitEvasionAttackRollEffects("increased")).toEqual([
      { type: "attackRoll", amount: 3, source: "Hit/Evasion (Increased)" },
    ])
  })

  it("Decreased confers −7 to Attack Rolls (deliberately steeper than the bonus)", () => {
    expect(hitEvasionAttackRollEffects("decreased")).toEqual([
      { type: "attackRoll", amount: -7, source: "Hit/Evasion (Decreased)" },
    ])
  })

  it("Neutral folds in nothing", () => {
    expect(hitEvasionAttackRollEffects("neutral")).toEqual([])
  })
})
