import { describe, expect, it } from "vitest"
import {
  applyLevelUp,
  canLevelUp,
  type LevelingCharacter,
  MAX_LEVEL,
} from "./leveling"

/** Default: a fresh Level 1 character with no banked Victories. */
function makeCharacter(
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
  it("is true with 7+ Victories below the level cap", () => {
    expect(canLevelUp(makeCharacter({ victories: 7 }))).toBe(true)
    expect(canLevelUp(makeCharacter({ victories: 12 }))).toBe(true)
  })

  it("is false with fewer than 7 Victories", () => {
    expect(canLevelUp(makeCharacter({ victories: 6 }))).toBe(false)
  })

  it("is false at the level cap regardless of Victories", () => {
    expect(
      canLevelUp(makeCharacter({ level: MAX_LEVEL, victories: 99 }))
    ).toBe(false)
  })
})

describe("applyLevelUp", () => {
  it("levels up cleanly at exactly 7 Victories", () => {
    const result = applyLevelUp(makeCharacter({ victories: 7 }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      level: 2,
      victories: 0,
      savedArchetypeRanks: 2,
      hitDiceRemaining: 3,
      skillDiceRemaining: 7,
    })
  })

  it("carries Victory overflow forward", () => {
    const eight = applyLevelUp(makeCharacter({ victories: 8 }))
    expect(eight.ok && eight.value.victories).toBe(1)

    const fifteen = applyLevelUp(makeCharacter({ victories: 15 }))
    expect(fifteen.ok && fifteen.value.victories).toBe(8)
  })

  it("accumulates saved Archetype Ranks across multiple level-ups", () => {
    const first = applyLevelUp(makeCharacter({ victories: 14 }))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.savedArchetypeRanks).toBe(2)

    const second = applyLevelUp(first.value)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.savedArchetypeRanks).toBe(4)
    expect(second.value.level).toBe(3)
    expect(second.value.victories).toBe(0)
  })

  it("refills Hit/Skill Dice to the new level's totals", () => {
    const result = applyLevelUp(
      makeCharacter({
        level: 4,
        victories: 7,
        hitDiceRemaining: 0,
        skillDiceRemaining: 1,
      })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hitDiceRemaining).toBe(6)
    expect(result.value.skillDiceRemaining).toBe(13)
  })

  it("fails with insufficient-victories below 7", () => {
    const result = applyLevelUp(makeCharacter({ victories: 6 }))
    expect(result).toEqual({ ok: false, error: "insufficient-victories" })
  })

  it("reaches the cap from Level 29 then refuses to go past 30", () => {
    const atCap = applyLevelUp(
      makeCharacter({ level: MAX_LEVEL - 1, victories: 7 })
    )
    expect(atCap.ok).toBe(true)
    if (!atCap.ok) return
    expect(atCap.value.level).toBe(MAX_LEVEL)

    expect(applyLevelUp(atCap.value)).toEqual({
      ok: false,
      error: "max-level",
    })
  })

  it("fails with max-level at the cap even with banked Victories", () => {
    const result = applyLevelUp(
      makeCharacter({ level: MAX_LEVEL, victories: 7 })
    )
    expect(result).toEqual({ ok: false, error: "max-level" })
  })

  it("does not mutate its input", () => {
    const character = makeCharacter({ victories: 9 })
    const snapshot = structuredClone(character)

    applyLevelUp(character)

    expect(character).toEqual(snapshot)
  })
})
