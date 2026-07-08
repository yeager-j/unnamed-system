import { describe, expect, it } from "vitest"

import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { createGameEngine } from "@workspace/game/engine/create-engine"

/**
 * Every boundary function {@link createGameEngine} is expected to bind. The
 * factory is pure delegation (no logic), so the test asserts the shape — every
 * method present and callable. The `newId` seam's threading is covered by the
 * reduce-character suites, which bind a deterministic generator directly (the
 * v1 combat-session factories that once exercised it here retired with
 * UNN-535/540).
 */
const EXPECTED_METHODS = [
  "deriveHydratedCharacter",
  "toStatContext",
  "buildStatContext",
  "reduceCharacter",
  "getArchetypeDisplay",
  "buildArchetypeEntries",
  "buildEnemyCatalogRows",
  "statblockFromEnemy",
  "buildLineageAtlas",
  "getAtlasRecommendations",
  "archetypeSwitcherGroups",
  "previewArchetypeSkills",
  "resolveTalentsForSheet",
  "resolveTalentsForBuilder",
  "equipItem",
  "addItem",
  "setItemQuantity",
] as const

describe("createGameEngine", () => {
  it("binds exactly the expected boundary functions, each callable", () => {
    const engine = createGameEngine(makeTestGameData())
    // Exact set, not just a subset, so a newly-bound boundary method without a
    // corresponding entry here fails rather than going unnoticed.
    expect(Object.keys(engine).sort()).toEqual([...EXPECTED_METHODS].sort())
    for (const name of EXPECTED_METHODS) {
      expect(typeof engine[name]).toBe("function")
    }
  })
})
