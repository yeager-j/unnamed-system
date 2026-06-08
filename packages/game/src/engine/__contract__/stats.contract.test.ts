import { describe, expect, it } from "vitest"

import { mage } from "@workspace/game/data/archetypes/mage/mage"
import { warrior } from "@workspace/game/data/archetypes/warrior/warrior"
import { gameData } from "@workspace/game/data/game-data"
import { makeStatContext } from "@workspace/game/engine/__fixtures__/character"
import { computeAttributes } from "@workspace/game/engine/character/stats/stats"

/**
 * Contract smoke (UNN-361): asserts the stat pipeline resolves a *shipped*
 * Archetype's base Attributes, and pins the Mage's SP Mastery shape. Derivation
 * behavior (bonuses, clamps, mastery gating, affinity folding) is proven against
 * fixtures in `character/stats/stats.test.ts`; this only guards the seam +
 * catalog drift.
 */
describe("stats — real catalog (smoke)", () => {
  it("derives the shipped Warrior's Attributes through the stat context", () => {
    expect(computeAttributes(makeStatContext({}, gameData))).toEqual(
      warrior.attributes
    )
  })

  it("keeps the Mage SP Mastery wired through max SP (transcription guard)", () => {
    expect(mage.mastery).toEqual({ kind: "sp", amount: 20 })
  })
})
