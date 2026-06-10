import { describe, expect, it } from "vitest"

import { warrior } from "@workspace/game/data/archetypes/warrior/warrior"
import { gameData } from "@workspace/game/data/game-data"
import {
  buildStatContext,
  type PersistedArchetypeState,
  type PersistedCharacterState,
} from "@workspace/game/engine/character/stats/stat-character"

/**
 * Contract smoke (UNN-363): asserts `buildStatContext` resolves a *shipped*
 * Archetype's Lineage, Mastery, and active Skills against the real catalog.
 * Assembly behavior (Rank gating, inheritance folding, mechanic coercion) is
 * proven against fixtures in `character/stats/stat-character.test.ts`; this only
 * guards the seam.
 */
const baseCharacter: PersistedCharacterState = {
  pathChoice: "balanced",
  level: 3,
  manualBonuses: { hp: 5 },
  activeCharacterArchetypeId: "ca-warrior",
}

function warriorRow(
  overrides: Partial<PersistedArchetypeState> = {}
): PersistedArchetypeState {
  return {
    id: "ca-warrior",
    archetypeKey: "warrior",
    rank: 2,
    inheritanceSlots: [],
    mechanicState: null,
    ...overrides,
  }
}

describe("buildStatContext — real catalog (smoke)", () => {
  it("resolves a shipped Archetype's Lineage, Mastery, and active Skills", () => {
    const result = buildStatContext(gameData)(
      baseCharacter,
      [warriorRow({ rank: 2 })],
      []
    )
    expect(result.activeLineage).toBe(warrior.lineage)
    expect(result.archetypes).toContainEqual({
      key: "warrior",
      rank: 2,
      mastery: warrior.mastery,
    })
    expect(result.activeSkills.length).toBeGreaterThan(0)
  })
})
