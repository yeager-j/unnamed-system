import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import { resolveTalents } from "@workspace/game/engine/character/talents/utils"

/**
 * Contract smoke (UNN-363): asserts `resolveTalents` wires against the *real*
 * shipped catalog, catching drift the fixture-backed unit tests can't. Behavior
 * is proven in `character/talents/utils.test.ts`; this only guards the seam.
 */
describe("resolveTalents — real catalog (smoke)", () => {
  it("resolves a shipped Archetype's Talents against the real catalog", () => {
    const result = resolveTalents([], "warrior", gameData)
    expect(result.length).toBeGreaterThan(0)
    expect(new Set(result).size).toBe(result.length)
  })
})
