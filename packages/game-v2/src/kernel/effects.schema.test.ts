import { describe, expect, it } from "vitest"

import {
  affinityEffectSchema,
  attackRollEffectSchema,
  attributeEffectSchema,
  damageEffectSchema,
} from "@workspace/game-v2/kernel/effects.schema"

describe("effects primitive (ported, D32)", () => {
  it("round-trips an affinity effect", () => {
    const effect = {
      type: "affinity" as const,
      damageTypes: ["fire", "ice"] as const,
      affinity: "weak" as const,
    }
    const parsed = affinityEffectSchema.safeParse(effect)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual(effect)
  })

  it("round-trips an attribute effect", () => {
    const effect = {
      type: "attribute" as const,
      target: "hp" as const,
      amount: 5,
    }
    const parsed = attributeEffectSchema.safeParse(effect)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual(effect)
  })

  it("rejects an affinity effect with an empty damageTypes list", () => {
    const parsed = affinityEffectSchema.safeParse({
      type: "affinity",
      damageTypes: [],
      affinity: "resist",
    })
    expect(parsed.success).toBe(false)
  })

  describe("attackRoll effect requires exactly one of amount | scaler", () => {
    it("accepts a flat amount", () => {
      expect(
        attackRollEffectSchema.safeParse({ type: "attackRoll", amount: 2 })
          .success
      ).toBe(true)
    })

    it("accepts a scaler", () => {
      expect(
        attackRollEffectSchema.safeParse({
          type: "attackRoll",
          scaler: {
            kind: "perPartyLineage",
            lineage: "mage",
            amount: 1,
            includesSelf: true,
          },
        }).success
      ).toBe(true)
    })

    it("rejects having both", () => {
      expect(
        attackRollEffectSchema.safeParse({
          type: "attackRoll",
          amount: 2,
          scaler: {
            kind: "perPartyLineage",
            lineage: "mage",
            amount: 1,
            includesSelf: true,
          },
        }).success
      ).toBe(false)
    })

    it("rejects having neither", () => {
      expect(
        attackRollEffectSchema.safeParse({ type: "attackRoll" }).success
      ).toBe(false)
    })
  })

  describe("damage effect requires exactly one of dice | amount", () => {
    it("accepts dice", () => {
      expect(
        damageEffectSchema.safeParse({
          type: "damage",
          dice: { count: 3, sides: 4 },
        }).success
      ).toBe(true)
    })

    it("rejects having both dice and amount", () => {
      expect(
        damageEffectSchema.safeParse({
          type: "damage",
          dice: { count: 3, sides: 4 },
          amount: 2,
        }).success
      ).toBe(false)
    })
  })
})
