import { describe, expect, it } from "vitest"

import {
  addSpark,
  applyLevelUp,
  canLevelUp,
  eligibleVirtuesForRankUp,
  MAX_LEVEL,
  rankUpVirtue,
  sparkLogBreakdown,
  type LevelingCharacter,
  type SparkCharacter,
} from "@workspace/game/engine/character/leveling"
import type {
  SparkLog,
  VirtueKey,
} from "@workspace/game/foundation/character/state"

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
    expect(canLevelUp(makeCharacter({ level: MAX_LEVEL, victories: 99 }))).toBe(
      false
    )
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

/** Default: empty log, every Virtue at Rank 0. Overridable per test. */
function makeSparkCharacter(
  overrides: Partial<SparkCharacter> = {}
): SparkCharacter {
  return {
    sparkLog: [],
    virtues: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
    ...overrides,
  }
}

/** Rulebook 1.2 canonical log: Wisdom ×4, Empathy ×2, Focus ×1 (full). */
const CANONICAL_LOG: SparkLog = [
  "wisdom",
  "wisdom",
  "wisdom",
  "wisdom",
  "empathy",
  "empathy",
  "focus",
]

describe("rulebook 1.2 canonical example", () => {
  const character = makeSparkCharacter({ sparkLog: CANONICAL_LOG })

  it("makes exactly Wisdom, Empathy, and Focus eligible", () => {
    expect(eligibleVirtuesForRankUp(character)).toEqual(
      new Set<VirtueKey>(["wisdom", "empathy", "focus"])
    )
  })

  it.each<VirtueKey>(["wisdom", "empathy", "focus"])(
    "allows ranking up %s",
    (virtue) => {
      const result = rankUpVirtue(character, virtue)
      expect(result.ok).toBe(true)
    }
  )

  it("does not allow ranking up Expression", () => {
    expect(rankUpVirtue(character, "expression")).toEqual({
      ok: false,
      error: "virtue-not-eligible",
    })
  })
})

describe("addSpark", () => {
  it("appends the tagged Virtue to a non-full log", () => {
    const result = addSpark(
      makeSparkCharacter({ sparkLog: ["wisdom"] }),
      "focus"
    )
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ sparkLog: ["wisdom", "focus"] }),
    })
  })

  it("fills the log up to capacity", () => {
    const result = addSpark(
      makeSparkCharacter({ sparkLog: CANONICAL_LOG.slice(0, 6) }),
      "expression"
    )
    expect(result.ok && result.value.sparkLog).toHaveLength(7)
  })

  it("rejects a Spark once the log is full", () => {
    expect(
      addSpark(makeSparkCharacter({ sparkLog: CANONICAL_LOG }), "wisdom")
    ).toEqual({ ok: false, error: "log-full" })
  })

  it("does not mutate the input character or its log", () => {
    const log: SparkLog = ["wisdom"]
    const character = makeSparkCharacter({ sparkLog: log })
    addSpark(character, "focus")
    expect(log).toEqual(["wisdom"])
    expect(character.sparkLog).toBe(log)
  })
})

describe("eligibleVirtuesForRankUp", () => {
  it("returns an empty set for a log below capacity", () => {
    const character = makeSparkCharacter({
      sparkLog: CANONICAL_LOG.slice(0, 6),
    })
    expect(eligibleVirtuesForRankUp(character).size).toBe(0)
  })

  it("returns the distinct Virtues of a full log", () => {
    const character = makeSparkCharacter({
      sparkLog: ["focus", "focus", "focus", "focus", "focus", "focus", "focus"],
    })
    expect(eligibleVirtuesForRankUp(character)).toEqual(
      new Set<VirtueKey>(["focus"])
    )
  })
})

describe("sparkLogBreakdown", () => {
  it("returns an empty array for an empty log", () => {
    expect(sparkLogBreakdown([])).toEqual([])
  })

  it("tallies a single Virtue", () => {
    expect(sparkLogBreakdown(["focus", "focus"])).toEqual([
      { virtue: "focus", count: 2 },
    ])
  })

  it("orders by count descending", () => {
    expect(sparkLogBreakdown(CANONICAL_LOG)).toEqual([
      { virtue: "wisdom", count: 4 },
      { virtue: "empathy", count: 2 },
      { virtue: "focus", count: 1 },
    ])
  })

  it("breaks count ties by VIRTUE_KEYS order", () => {
    expect(
      sparkLogBreakdown(["wisdom", "focus", "wisdom", "expression"])
    ).toEqual([
      { virtue: "wisdom", count: 2 },
      { virtue: "expression", count: 1 },
      { virtue: "focus", count: 1 },
    ])
  })
})

describe("rankUpVirtue", () => {
  it("increments only the chosen Virtue and clears the log", () => {
    const character = makeSparkCharacter({
      sparkLog: CANONICAL_LOG,
      virtues: { expression: 1, empathy: 2, wisdom: 3, focus: 0 },
    })
    const result = rankUpVirtue(character, "wisdom")
    expect(result).toEqual({
      ok: true,
      value: {
        sparkLog: [],
        virtues: { expression: 1, empathy: 2, wisdom: 4, focus: 0 },
      },
    })
  })

  it("rejects a Virtue absent from the log without mutating", () => {
    const virtues = { expression: 0, empathy: 0, wisdom: 0, focus: 0 }
    const character = makeSparkCharacter({ sparkLog: CANONICAL_LOG, virtues })
    expect(rankUpVirtue(character, "expression")).toEqual({
      ok: false,
      error: "virtue-not-eligible",
    })
    expect(character.virtues).toBe(virtues)
    expect(character.sparkLog).toEqual(CANONICAL_LOG)
  })

  it("rejects rank-up when the log is not exactly full", () => {
    const character = makeSparkCharacter({
      sparkLog: CANONICAL_LOG.slice(0, 6),
    })
    expect(rankUpVirtue(character, "wisdom")).toEqual({
      ok: false,
      error: "log-not-full",
    })
  })

  it("rejects rank-up at the rank ceiling and preserves the log", () => {
    const character = makeSparkCharacter({
      sparkLog: CANONICAL_LOG,
      virtues: { expression: 0, empathy: 0, wisdom: 7, focus: 0 },
    })
    const result = rankUpVirtue(character, "wisdom")
    expect(result).toEqual({ ok: false, error: "rank-capped" })
    expect(character.sparkLog).toEqual(CANONICAL_LOG)
  })

  it("does not mutate the input on success", () => {
    const log = [...CANONICAL_LOG]
    const virtues = { expression: 0, empathy: 0, wisdom: 0, focus: 0 }
    const character = makeSparkCharacter({ sparkLog: log, virtues })
    rankUpVirtue(character, "focus")
    expect(character.sparkLog).toBe(log)
    expect(log).toEqual(CANONICAL_LOG)
    expect(character.virtues).toBe(virtues)
    expect(virtues.focus).toBe(0)
  })
})
