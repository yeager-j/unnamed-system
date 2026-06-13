import { describe, expect, it } from "vitest"

import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { createGameEngine } from "@workspace/game/engine/create-engine"
import type { CombatantSetup } from "@workspace/game/foundation/encounter/session"

/**
 * Every boundary function {@link createGameEngine} is expected to bind. The
 * factory is pure delegation (no logic), so the test asserts the shape — every
 * method present and callable — plus that the `newId` seam is honored (default
 * generator used when omitted, injected generator threaded through to the
 * id-minting boundary functions).
 */
const EXPECTED_METHODS = [
  "deriveHydratedCharacter",
  "toStatContext",
  "buildStatContext",
  "reduceCharacter",
  "getArchetypeDisplay",
  "buildArchetypeEntries",
  "buildEnemyCatalogRows",
  "resolveCatalogEnemyStatblocks",
  "statblockFromEnemy",
  "reduceCombatSession",
  "endOfTurnObligations",
  "buildLineageAtlas",
  "getAtlasRecommendations",
  "archetypeSwitcherGroups",
  "previewArchetypeSkills",
  "resolveTalentsForSheet",
  "resolveTalentsForBuilder",
  "equipItem",
  "addItem",
  "setItemQuantity",
  "createCombatSession",
] as const

const setup: CombatantSetup[] = [
  { side: "players", ref: { kind: "pc", characterId: "char-1" }, zoneId: "z" },
]

describe("createGameEngine", () => {
  it("binds every boundary function, each callable", () => {
    const engine = createGameEngine(makeTestGameData())
    for (const name of EXPECTED_METHODS) {
      expect(typeof engine[name]).toBe("function")
    }
  })

  it("defaults newId to a real id generator when none is injected", () => {
    const engine = createGameEngine(makeTestGameData())

    const session = engine.createCombatSession(setup)
    const id = session.combatants[0]?.id

    expect(typeof id).toBe("string")
    expect(id).not.toBe("")
  })

  it("threads the injected newId into the id-minting boundary functions", () => {
    const engine = createGameEngine(makeTestGameData(), () => "fixed-id")

    const session = engine.createCombatSession(setup)

    expect(session.combatants[0]?.id).toBe("fixed-id")
  })
})
