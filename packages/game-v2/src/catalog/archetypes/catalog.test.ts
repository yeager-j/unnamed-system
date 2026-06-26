import { describe, expect, it } from "vitest"

import {
  allArchetypes,
  getArchetype,
} from "@workspace/game-v2/catalog/archetypes"
import { getSkill } from "@workspace/game-v2/catalog/skills"
import { getMechanic } from "@workspace/game-v2/mechanics/registry"

/**
 * A thin real-data smoke test over the ported Archetype catalog (the registry's
 * load-time `validate` already asserts referential integrity at import; this pins
 * the shipped set and re-checks the cross-references explicitly).
 */
describe("Archetype catalog (UNN-504 content port)", () => {
  it("ships the eight Initiate Archetypes plus the Adept elemental-thief", () => {
    expect(
      allArchetypes()
        .map((a) => a.key)
        .sort()
    ).toEqual([
      "bard",
      "berserker",
      "elemental-thief",
      "healer",
      "knight",
      "mage",
      "thief",
      "warlock",
      "warrior",
    ])
  })

  it("getArchetype resolves a known key and misses an unknown one", () => {
    expect(getArchetype("warrior")?.name).toBe("Warrior")
    expect(getArchetype("nope")).toBeUndefined()
  })

  it("every Archetype's Skills, Synthesis, and Mechanic resolve in their catalogs", () => {
    for (const archetype of allArchetypes()) {
      for (const { skill } of archetype.skills) {
        expect(getSkill(skill), `${archetype.key} → ${skill}`).toBeDefined()
      }
      if (archetype.synthesisSkill) {
        expect(getSkill(archetype.synthesisSkill.skill)).toBeDefined()
      }
      if (archetype.mechanic) {
        expect(getMechanic(archetype.mechanic)).toBeDefined()
      }
    }
  })
})
