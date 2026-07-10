import { describe, expect, it } from "vitest"

import type { Archetypes } from "@workspace/game-v2/archetypes/archetypes.schema"
import type { Level } from "@workspace/game-v2/progression/level.schema"
import {
  applyAwardVictory,
  applyLevelUp,
  applyRemoveVictory,
  canLevelUp,
  MAX_LEVEL,
  type LevelingComponents,
} from "@workspace/game-v2/progression/leveling"

function level(overrides: Partial<Level> = {}): Level {
  return { value: 1, victories: 0, ...overrides }
}

function components(
  levelOverrides: Partial<Level> = {},
  savedArchetypeRanks = 0
): LevelingComponents {
  const archetypes: Archetypes = {
    active: "knight",
    origin: "knight",
    savedArchetypeRanks,
    roster: [{ key: "knight", rank: 1, inheritanceSlots: [] }],
  }
  return {
    level: level(levelOverrides),
    archetypes,
  }
}

describe("applyAwardVictory / applyRemoveVictory", () => {
  it("award increments; banking past 7 is allowed", () => {
    expect(applyAwardVictory(level({ victories: 6 }))).toEqual(
      level({ victories: 7 })
    )
    expect(applyAwardVictory(level({ victories: 8 }))).toEqual(
      level({ victories: 9 })
    )
  })

  it("remove decrements, clamped at 0", () => {
    expect(applyRemoveVictory(level({ victories: 2 }))).toEqual(
      level({ victories: 1 })
    )
    expect(applyRemoveVictory(level({ victories: 0 }))).toEqual(
      level({ victories: 0 })
    )
  })
})

describe("canLevelUp", () => {
  it("true at ≥ 7 victories below the cap", () => {
    expect(canLevelUp(level({ victories: 7 }))).toBe(true)
    expect(canLevelUp(level({ victories: 6 }))).toBe(false)
  })

  it("false at the level cap regardless of victories", () => {
    expect(canLevelUp(level({ value: MAX_LEVEL, victories: 99 }))).toBe(false)
  })
})

describe("applyLevelUp", () => {
  it("+1 level, −7 victories (overflow carries), +2 saved ranks", () => {
    const result = applyLevelUp(components({ value: 4, victories: 9 }, 1))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.level).toEqual({ value: 5, victories: 2 })
      expect(result.value.archetypes).toEqual({
        active: "knight",
        origin: "knight",
        savedArchetypeRanks: 3,
        roster: [{ key: "knight", rank: 1, inheritanceSlots: [] }],
      })
    }
  })

  it("touches only progression-class components — no vitals or resources key (single-class write, ADR §2.2)", () => {
    const result = applyLevelUp(components({ victories: 7 }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.value).sort()).toEqual(["archetypes", "level"])
    }
  })

  it("fails 'insufficient-victories' without mutating", () => {
    const input = components({ victories: 6 })
    const result = applyLevelUp(input)
    expect(result).toEqual({ ok: false, error: "insufficient-victories" })
    expect(input.level).toEqual({ value: 1, victories: 6 })
  })

  it("fails 'max-level' — checked before the victory check", () => {
    const result = applyLevelUp(components({ value: MAX_LEVEL, victories: 99 }))
    expect(result).toEqual({ ok: false, error: "max-level" })
  })
})
