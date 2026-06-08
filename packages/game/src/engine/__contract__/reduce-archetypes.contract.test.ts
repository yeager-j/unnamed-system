import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import { makeRawCharacterInputs } from "@workspace/game/engine/__fixtures__/character"
import { reduceArchetypeEdit } from "@workspace/game/engine/character/reduce/archetypes"

/**
 * Contract smoke (UNN-363): asserts `reduceArchetypeEdit` unlocks a *shipped*
 * Archetype against the production catalog. Unlock/rank/inheritance behavior is
 * proven against fixtures in `character/reduce/archetypes.test.ts`; this only
 * guards the seam.
 */
const STABLE_ID = () => "minted-id"

describe("reduceArchetypeEdit — real catalog (smoke)", () => {
  it("unlocks a shipped Archetype against the production catalog", () => {
    const raw = makeRawCharacterInputs({ row: { savedArchetypeRanks: 1 } })
    const next = reduceArchetypeEdit(
      raw,
      { kind: "unlockArchetype", archetypeKey: "warrior" },
      STABLE_ID,
      gameData.allArchetypes()
    )
    expect(
      next?.archetypeRows.find((row) => row.id === "minted-id")?.archetypeKey
    ).toBe("warrior")
  })
})
