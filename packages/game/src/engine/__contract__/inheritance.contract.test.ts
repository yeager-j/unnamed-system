import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import {
  makeArchetypeRow,
  makeHydratedCharacter,
} from "@workspace/game/engine/__fixtures__/character"
import { inheritanceSourceGroups } from "@workspace/game/engine/archetypes/inheritance"
import { buildArchetypeEntries } from "@workspace/game/engine/archetypes/utils"

/**
 * Contract smoke (UNN-363): asserts inheritance resolution wires across two
 * *shipped* Archetypes. Source-group/filtering behavior is proven against
 * fixtures in `archetypes/inheritance.test.ts`; this only guards the seam.
 */
describe("inheritance — real catalog (smoke)", () => {
  it("resolves inheritable Skills between two shipped Archetypes", () => {
    const character = makeHydratedCharacter({
      row: { activeArchetypeId: "w", originCharacterArchetypeId: "w" },
      archetypeRows: [
        makeArchetypeRow({ id: "w", archetypeKey: "warrior", rank: 3 }),
        makeArchetypeRow({ id: "m", archetypeKey: "mage", rank: 2 }),
      ],
    })
    const groups = inheritanceSourceGroups(
      buildArchetypeEntries(character, gameData),
      "w"
    )
    expect(groups.map((g) => g.archetype.key)).toEqual(["mage"])
    expect(groups[0]!.skills.length).toBeGreaterThan(0)
  })
})
