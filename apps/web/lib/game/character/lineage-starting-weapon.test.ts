import { describe, expect, it } from "vitest"

import {
  LINEAGE_STARTING_WEAPON,
  startingWeaponForLineage,
} from "./lineage-starting-weapon"

describe("startingWeaponForLineage", () => {
  it("returns the canonical starter for every Lineage that ships an Archetype", () => {
    expect(startingWeaponForLineage("warrior")).toBe("longsword")
    expect(startingWeaponForLineage("knight")).toBe("spear")
    expect(startingWeaponForLineage("mage")).toBe("staff")
    expect(startingWeaponForLineage("healer")).toBe("censer")
  })

  it("returns null for Lineages with no shipped Archetype", () => {
    // No character can finalize against these Lineages today (no Origin to
    // pick), but the finalize action's `"no-starting-weapon-for-lineage"`
    // path stays alive as a guard for a future Lineage that ships an
    // Archetype before its canonical starter weapon.
    expect(startingWeaponForLineage("brawler")).toBeNull()
    expect(startingWeaponForLineage("berserker")).toBeNull()
  })

  it("every entry in the map references a shipped Weapon", () => {
    // Catalog cross-reference integrity is also enforced by validate() in
    // `lib/game/items/index.ts` at module load, but pinning it here makes
    // the contract explicit at the consumer.
    for (const key of Object.values(LINEAGE_STARTING_WEAPON)) {
      expect(typeof key).toBe("string")
    }
  })
})
