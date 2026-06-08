import { describe, expect, it } from "vitest"

import { ENEMIES } from "@workspace/game/data/enemies/registry"
import { gameData } from "@workspace/game/data/game-data"
import { statblockFromEnemy } from "@workspace/game/engine/combatant/statblock"

/**
 * Contract smoke (UNN-363): asserts `statblockFromEnemy` projects a *shipped*
 * enemy end-to-end against the real catalog. Projection behavior is proven
 * against fixtures in `combatant/statblock.test.ts`; this only guards the seam.
 */
describe("statblockFromEnemy — real catalog (smoke)", () => {
  it("projects a shipped enemy's flat sheet and hydrated skills", () => {
    const enemy = ENEMIES.find((e) => e.skillKeys.length > 0)
    expect(enemy).toBeDefined()

    const statblock = statblockFromEnemy(enemy!, gameData)
    expect(statblock.source).toBe("enemy")
    expect(statblock.name).toBe(enemy!.name)
    expect(statblock.skills).toHaveLength(enemy!.skillKeys.length)
  })
})
