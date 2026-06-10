import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import {
  resolveTalentsForBuilder,
  resolveTalentsForSheet,
} from "@workspace/game/engine/character/talents/display"

/**
 * Contract smoke (UNN-363): asserts the talents-display shapers wire against the
 * *real* shipped catalog. Ordering/shape behavior is proven against fixtures in
 * `character/talents/display.test.ts`; this only guards the seam.
 */
describe("talents display — real catalog (smoke)", () => {
  it("shapes a shipped Archetype's inherited chips and Origin from the real catalog", () => {
    const { chips } = resolveTalentsForSheet(gameData)([], "warrior")
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.every((chip) => chip.inherited)).toBe(true)

    const { origin } = resolveTalentsForBuilder(gameData)("warrior")
    expect(origin.length).toBeGreaterThan(0)
  })
})
