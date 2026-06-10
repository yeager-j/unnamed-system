import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import {
  makeArchetypeRow,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import { deriveHydratedCharacter } from "@workspace/game/engine/character/derive-hydrated-character"
import { reduceCharacter } from "@workspace/game/engine/character/reduce-character"

/**
 * Contract smoke (UNN-363): drives the whole derive→reduce pipeline over the
 * *real* shipped catalog, catching catalog drift the fixture-backed integration
 * tests can't. Reducer behavior is proven against fixtures in
 * `__integration__/reduce-character.integration.test.ts`; this only guards the
 * seam.
 */
describe("reduceCharacter — real catalog (smoke)", () => {
  /** A finalized Warrior built straight from the shipped catalog. */
  const realCharacter = () =>
    deriveHydratedCharacter(gameData)(
      makeRawCharacterInputs({
        row: {
          activeArchetypeId: "arch-1",
          originCharacterArchetypeId: "arch-1",
        },
        archetypeRows: [
          makeArchetypeRow({ id: "arch-1", archetypeKey: "warrior", rank: 1 }),
        ],
      })
    )

  it("derives a shipped Archetype's vitals and Skills end-to-end", () => {
    const character = realCharacter()
    expect(character.maxHP).toBeGreaterThan(0)
    expect(character.skills.length).toBeGreaterThan(0)
  })

  it("casts a shipped Skill through the reducer, spending a pool", () => {
    const character = realCharacter()
    const castable = character.skills.find((skill) => skill.resolvedCost)
    expect(castable).toBeDefined()

    const next = reduceCharacter(gameData, () => "smoke-id")(character, {
      kind: "cast",
      skillKey: castable!.key,
    })
    expect(next.currentHP + next.currentSP).toBeLessThan(
      character.currentHP + character.currentSP
    )
  })
})
