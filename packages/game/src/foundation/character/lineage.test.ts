import { describe, expect, it } from "vitest"

import {
  LINEAGE_STARTING_WEAPON,
  startingWeaponForLineage,
} from "@workspace/game/foundation/character/lineage"

describe("startingWeaponForLineage", () => {
  it("returns the canonical starter for every Lineage that ships an Archetype", () => {
    expect(startingWeaponForLineage("warrior")).toBe("longsword")
    expect(startingWeaponForLineage("knight")).toBe("spear")
    expect(startingWeaponForLineage("mage")).toBe("staff")
    expect(startingWeaponForLineage("healer")).toBe("censer")
    expect(startingWeaponForLineage("thief")).toBe("dagger")
    expect(startingWeaponForLineage("berserker")).toBe("greataxe")
  })

  it("returns null for Lineages with no shipped Archetype", () => {
    expect(startingWeaponForLineage("brawler")).toBeNull()
  })

  it("every entry in the map references a shipped Weapon", () => {
    for (const key of Object.values(LINEAGE_STARTING_WEAPON)) {
      expect(typeof key).toBe("string")
    }
  })
})
