import { describe, expect, it } from "vitest"

import {
  getEnchantment,
  zoneEnchantmentEffects,
} from "@workspace/game/engine/encounter/enchantment"
import { forteMarking } from "@workspace/game/foundation/combat/enchantment"

/**
 * Unit tests for the Enchantment **effects** helpers — the `zoneEnchantmentEffects`
 * fold into PC stat derivation and its supporting definitions. The Enchantment
 * *transitions* (apply/clear/raise-Forte, removeZone→clear) moved onto the Map
 * Instance with the M0 cutover (UNN-459) and are covered by
 * `reduce-map-instance.test.ts`; only the effects helper lives here.
 */

describe("enchantment definitions", () => {
  it("emits a Toccata Attack-Roll bonus equal to the Zone's Forte", () => {
    expect(getEnchantment("toccata").effects(2)).toEqual([
      { type: "attackRoll", amount: 2, source: "Toccata" },
    ])
  })

  it("emits no structured effects for Requiem and Tarantella (prose-only rules)", () => {
    expect(getEnchantment("requiem").effects(3)).toEqual([])
    expect(getEnchantment("tarantella").effects(3)).toEqual([])
  })
})

describe("forteMarking", () => {
  it("maps Forte 1/2/3 to the dynamic markings f/ff/fff, clamped at the ends", () => {
    expect(forteMarking(1)).toBe("f")
    expect(forteMarking(2)).toBe("ff")
    expect(forteMarking(3)).toBe("fff")
    expect(forteMarking(0)).toBe("f")
    expect(forteMarking(9)).toBe("fff")
  })
})

describe("zoneEnchantmentEffects", () => {
  it("returns the Enchantment's effects for a combatant in the Enchanted Zone", () => {
    const effects = zoneEnchantmentEffects(
      { zoneId: "zone-0", type: "toccata", forte: 3 },
      "zone-0"
    )
    expect(effects).toEqual([
      { type: "attackRoll", amount: 3, source: "Toccata" },
    ])
  })

  it("returns nothing when no Enchantment is active", () => {
    expect(zoneEnchantmentEffects(null, "zone-0")).toEqual([])
  })

  it("returns nothing for a combatant in a different Zone", () => {
    expect(
      zoneEnchantmentEffects(
        { zoneId: "zone-0", type: "toccata", forte: 3 },
        "zone-1"
      )
    ).toEqual([])
  })
})
