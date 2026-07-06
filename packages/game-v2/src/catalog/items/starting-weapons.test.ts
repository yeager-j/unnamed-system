import { describe, expect, it } from "vitest"

import { getItem } from "@workspace/game-v2/catalog/items"
import { startingWeaponForLineage } from "@workspace/game-v2/catalog/items/starting-weapons"
import { LINEAGES } from "@workspace/game-v2/kernel/vocab"

/**
 * The per-Lineage starting-weapon table (UNN-556, re-homed from v1). Importing
 * the module already asserts every entry resolves to an equippable weapon (the
 * loader throws otherwise); this pins the v1 parity set — which Lineages have a
 * starter and which surface finalize's `"no-starting-weapon-for-lineage"`.
 */
describe("startingWeaponForLineage", () => {
  const EXPECTED: Partial<Record<(typeof LINEAGES)[number], string>> = {
    warrior: "longsword",
    mage: "staff",
    healer: "censer",
    knight: "spear",
    thief: "dagger",
    warlock: "grimoire",
    bard: "lute",
    berserker: "greataxe",
  }

  it.each(LINEAGES)("matches the v1 table for %s", (lineage) => {
    expect(startingWeaponForLineage(lineage)).toBe(EXPECTED[lineage])
  })

  it("every authored starter resolves to an equippable weapon", () => {
    for (const lineage of LINEAGES) {
      const key = startingWeaponForLineage(lineage)
      if (key === undefined) continue
      expect(getItem(key)?.equip?.slot).toBe("weapon")
    }
  })
})
