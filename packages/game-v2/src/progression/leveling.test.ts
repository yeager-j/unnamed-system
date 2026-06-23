import { describe, expect, it } from "vitest"

import {
  applyLevelUp,
  canLevelUp,
  MAX_LEVEL,
  type LevelingCharacter,
} from "@workspace/game-v2/progression/leveling"

function character(
  overrides: Partial<LevelingCharacter> = {}
): LevelingCharacter {
  return {
    level: 1,
    victories: 0,
    savedArchetypeRanks: 0,
    hitDiceRemaining: 2,
    skillDiceRemaining: 5,
    ...overrides,
  }
}

describe("canLevelUp", () => {
  it("true at ≥ 7 victories below the cap", () => {
    expect(canLevelUp(character({ victories: 7 }))).toBe(true)
    expect(canLevelUp(character({ victories: 6 }))).toBe(false)
  })

  it("false at the level cap regardless of victories", () => {
    expect(canLevelUp(character({ level: MAX_LEVEL, victories: 99 }))).toBe(
      false
    )
  })
})

describe("applyLevelUp", () => {
  it("+1 level, −7 victories (overflow carries), +2 saved ranks, dice refilled to new max", () => {
    const result = applyLevelUp(
      character({ level: 4, victories: 9, savedArchetypeRanks: 1 })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.level).toBe(5)
      expect(result.value.victories).toBe(2) // 9 − 7 carries
      expect(result.value.savedArchetypeRanks).toBe(3)
      expect(result.value.hitDiceRemaining).toBe(6) // level 5 + 1
      expect(result.value.skillDiceRemaining).toBe(13) // 2·5 + 3
    }
  })

  it("fails 'insufficient-victories' without mutating", () => {
    const input = character({ victories: 6 })
    const result = applyLevelUp(input)
    expect(result).toEqual({ ok: false, error: "insufficient-victories" })
    expect(input.level).toBe(1)
  })

  it("fails 'max-level' — checked before the victory check", () => {
    const result = applyLevelUp(character({ level: MAX_LEVEL, victories: 99 }))
    expect(result).toEqual({ ok: false, error: "max-level" })
  })
})
