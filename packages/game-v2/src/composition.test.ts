import { describe, expect, it } from "vitest"

import { createGameEngine } from "@workspace/game-v2/composition"

describe("createGameEngine interface", () => {
  it("contains only catalog-bound functions", () => {
    expect(Object.keys(createGameEngine()).sort()).toEqual(
      [
        "allItems",
        "applyInventoryMutation",
        "applySetInheritanceSlot",
        "applySetOrigin",
        "applySpendArchetypeRank",
        "archetypesByLineage",
        "buildLineageAtlas",
        "createSession",
        "creationArchetypes",
        "getArchetype",
        "getAtlasRecommendations",
        "instantiateEnemy",
        "resolveArchetypeRoster",
        "resolveBasicAttack",
        "resolveCreationArchetypeSkills",
        "resolveEntity",
        "resolveInventory",
        "resolveOriginTalentChoices",
        "resolveSession",
        "resolveTalentRoster",
        "resolveTalents",
        "resolve",
        "startingWeaponForLineage",
      ].sort()
    )
  })
})
