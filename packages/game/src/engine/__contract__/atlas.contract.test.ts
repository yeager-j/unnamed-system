import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import {
  makeArchetypeRow,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import {
  buildLineageAtlas,
  getAtlasRecommendations,
} from "@workspace/game/engine/archetypes/atlas"
import { deriveHydratedCharacter } from "@workspace/game/engine/character/derive-hydrated-character"

/**
 * Contract smoke (UNN-363): composes the atlas view builder + recommendations
 * over the *real* shipped catalog. Node-state / recommendation behavior is proven
 * against fixtures in `archetypes/atlas.test.ts`; this only guards the seam.
 */
describe("buildLineageAtlas + getAtlasRecommendations — real catalog (smoke)", () => {
  it("composes the view builder and recommendations over the shipped catalog", () => {
    const character = deriveHydratedCharacter(gameData)(
      makeRawCharacterInputs({
        row: { activeArchetypeId: "a1", originCharacterArchetypeId: "a1" },
        archetypeRows: [
          makeArchetypeRow({ id: "a1", archetypeKey: "warrior", rank: 2 }),
        ],
      })
    )
    const view = buildLineageAtlas(gameData)(character)

    const result = getAtlasRecommendations(view, "health-focused", 1)

    expect(result[0]!.archetype.key).toBe("warrior")
    expect(result[0]!.reason).toBe("origin-lineage")
    expect(result.map((r) => r.archetype.key)).toContain("knight")
    expect(new Set(result.map((r) => r.archetype.key)).size).toBe(result.length)
  })
})
