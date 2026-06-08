import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import { isEquippable } from "@workspace/game/foundation/items/schema"

/**
 * Contract smoke (UNN-363): asserts a *shipped* item classifies as equippable
 * through the real registry. Equip/inventory behavior is proven against fixtures
 * in `items/utils.test.ts`; this only guards the seam.
 */
describe("item utils — real catalog (smoke)", () => {
  it("classifies a shipped equippable item via the real registry", () => {
    const item = gameData.getItem("longsword")
    expect(item).toBeDefined()
    if (!item) return
    expect(isEquippable(item)).toBe(true)
    expect(gameData.getEquippableItem("longsword")).toBeDefined()
  })
})
