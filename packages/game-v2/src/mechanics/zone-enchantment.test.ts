import { describe, expect, it } from "vitest"

import {
  getEnchantment,
  zoneEnchantmentEffects,
} from "@workspace/game-v2/mechanics/zone-enchantment"
import {
  ENCHANTMENT_TYPES,
  forteMarking,
  MAX_FORTE,
} from "@workspace/game-v2/mechanics/zone-enchantment.schema"

/** E — the Bard zone-enchantment behavior (the engine-visible half of the mechanic). */
describe("forteMarking", () => {
  it("maps a Forte to its notation, clamped to 1..MAX", () => {
    expect(forteMarking(1)).toBe("f")
    expect(forteMarking(2)).toBe("ff")
    expect(forteMarking(3)).toBe("fff")
    expect(forteMarking(0)).toBe("f")
    expect(forteMarking(99)).toBe("fff")
  })
})

describe("getEnchantment + per-type effects", () => {
  it("is total over the closed union", () => {
    for (const type of ENCHANTMENT_TYPES) {
      expect(getEnchantment(type).type).toBe(type)
      expect(getEnchantment(type).forteLines).toHaveLength(MAX_FORTE)
    }
  })

  it("Toccata grants a single Attack-Roll bonus equal to the Forte", () => {
    expect(getEnchantment("toccata").effects(2)).toEqual([
      { type: "attackRoll", amount: 2, source: "Toccata" },
    ])
  })

  it("Requiem and Tarantella emit no structured effects", () => {
    expect(getEnchantment("requiem").effects(3)).toEqual([])
    expect(getEnchantment("tarantella").effects(3)).toEqual([])
  })
})

describe("zoneEnchantmentEffects", () => {
  it("confers the effects only on a combatant in the Enchanted Zone", () => {
    const enchantment = { zoneId: "z1", type: "toccata", forte: 3 } as const
    expect(zoneEnchantmentEffects(enchantment, "z1")).toEqual([
      { type: "attackRoll", amount: 3, source: "Toccata" },
    ])
    expect(zoneEnchantmentEffects(enchantment, "z2")).toEqual([])
  })

  it("returns [] when no Enchantment is active", () => {
    expect(zoneEnchantmentEffects(null, "z1")).toEqual([])
  })
})
