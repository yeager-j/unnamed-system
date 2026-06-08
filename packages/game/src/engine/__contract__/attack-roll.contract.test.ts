import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import { evilTouch } from "@workspace/game/data/skills/ailment/evil-touch"
import { slashBoost } from "@workspace/game/data/skills/passive/slash-boost"
import { garu } from "@workspace/game/data/skills/wind/garu"
import { makeStatContext } from "@workspace/game/engine/__fixtures__/character"
import {
  resolveAttackRoll,
  skillAttackRollContext,
  type AttackRollContext,
} from "@workspace/game/engine/combat/attack-roll"

/**
 * Contract smoke (UNN-361): folds a *shipped* passive into a *shipped* Warrior's
 * Attack Roll and derives the context arms from *shipped* Skills, against the
 * real catalog. Filter/scaler/composition behavior is proven against fixtures in
 * `combat/attack-roll.test.ts`; this only guards the seam.
 */
const SLASH_ST: AttackRollContext = {
  kind: "attack",
  damageType: "slash",
  delivery: "physical",
  attribute: "st",
}

describe("attack-roll — real catalog (smoke)", () => {
  it("folds a shipped Slash passive into a shipped Warrior's Slash Attack Roll", () => {
    const withBoost = resolveAttackRoll(
      SLASH_ST,
      makeStatContext({ activeSkills: [slashBoost] }, gameData),
      null
    )
    const without = resolveAttackRoll(
      SLASH_ST,
      makeStatContext({}, gameData),
      null
    )
    expect(withBoost.total).toBeGreaterThan(without.total)
  })

  it("derives the Attack-Roll context arms from shipped Skills", () => {
    expect(skillAttackRollContext(garu)?.kind).toBe("attack")
    expect(skillAttackRollContext(evilTouch)?.kind).toBe("ailment")
  })
})
