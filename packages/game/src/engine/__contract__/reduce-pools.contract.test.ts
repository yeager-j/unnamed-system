import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import {
  makeArchetypeRow,
  makeHydratedCharacter,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import { reducePoolsEdit } from "@workspace/game/engine/character/reduce/pools"

/**
 * Contract smoke (UNN-361): casts a *shipped* cost-bearing Skill through
 * `reducePoolsEdit` end-to-end against the real catalog. Pool arithmetic is
 * proven against fixtures in `character/reduce/pools.test.ts`; this only guards
 * that a real Warrior's derived Skills carry resolvable costs the reducer spends.
 */
describe("reducePoolsEdit — real catalog (smoke)", () => {
  it("deducts a shipped Skill's resolved cost from the matching pool", () => {
    const raw = makeRawCharacterInputs({
      row: { level: 5, currentSP: 50, activeArchetypeId: "arch-1" },
      archetypeRows: [
        makeArchetypeRow({ id: "arch-1", archetypeKey: "warrior", rank: 5 }),
      ],
    })
    const character = makeHydratedCharacter(
      {
        row: raw.row,
        archetypeRows: raw.archetypeRows,
      },
      gameData
    )
    const castable = character.skills.find((skill) => skill.resolvedCost)
    expect(castable).toBeDefined()

    const next = reducePoolsEdit(raw, character, {
      kind: "cast",
      skillKey: castable!.key,
    })
    const pools = next!.row
    expect(pools.currentHP + pools.currentSP).toBeLessThan(
      raw.row.currentHP + raw.row.currentSP
    )
  })
})
