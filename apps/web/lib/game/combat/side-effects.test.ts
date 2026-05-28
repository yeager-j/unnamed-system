import { describe, expect, it } from "vitest"

import { WEAPONS } from "../items"
import { SKILLS } from "../skills"
import { getSideEffect, SIDE_EFFECT_KEYS, SIDE_EFFECTS } from "./side-effects"

describe("side-effect data", () => {
  it("exposes a non-empty registry", () => {
    expect(SIDE_EFFECTS.length).toBeGreaterThan(0)
    expect(SIDE_EFFECT_KEYS.length).toBe(SIDE_EFFECTS.length)
  })

  it("has a unique, slug-shaped key for every Side Effect", () => {
    const keys = SIDE_EFFECTS.map((sideEffect) => sideEffect.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("resolves every Side Effect by its own key", () => {
    for (const sideEffect of SIDE_EFFECTS) {
      expect(getSideEffect(sideEffect.key)).toBe(sideEffect)
    }
  })
})

describe("getSideEffect", () => {
  it("returns undefined for an unknown key", () => {
    expect(getSideEffect("nope")).toBeUndefined()
  })
})

describe("side-effect cross-references", () => {
  it("resolves every Skill tier side effect from the registry", () => {
    for (const skill of SKILLS) {
      if (!("attackRoll" in skill) || !skill.attackRoll) continue
      for (const tier of skill.attackRoll.tiers) {
        for (const key of tier.sideEffects) {
          expect(getSideEffect(key)).toBeDefined()
        }
      }
    }
  })

  it("resolves every weapon intrinsic-attack side effect from the registry", () => {
    for (const weapon of WEAPONS) {
      for (const tier of weapon.equip.intrinsicAttack.attackRoll.tiers) {
        for (const key of tier.sideEffects) {
          expect(getSideEffect(key)).toBeDefined()
        }
      }
    }
  })
})
