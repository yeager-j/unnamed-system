import { describe, expect, it } from "vitest"

import { ENEMIES } from "@workspace/game/data/enemies/registry"
import { gameData } from "@workspace/game/data/game-data"
import { buildEnemyCatalogRows } from "@workspace/game/engine/enemies/catalog-rows"

/**
 * Contract smoke (UNN-363): asserts `buildEnemyCatalogRows` projects the *real*
 * shipped catalog, one row per enemy with a resolved family. Row/filter/group
 * behavior is proven against fixtures in `enemies/catalog-rows.test.ts`; this
 * only guards the seam.
 */
describe("buildEnemyCatalogRows — real catalog (smoke)", () => {
  it("builds one row per shipped enemy, each with a resolved family", () => {
    const rows = buildEnemyCatalogRows(gameData)
    expect(rows).toHaveLength(ENEMIES.length)
    expect(rows.every((row) => row.family)).toBe(true)
  })
})
