import { describe, expect, it } from "vitest"
import type { SparkLog, VirtueKey } from "./character"
import {
  addSpark,
  eligibleVirtuesForRankUp,
  rankUpVirtue,
  type SparkCharacter,
} from "./spark"

/** Default: empty log, every Virtue at Rank 0. Overridable per test. */
function makeCharacter(
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
  const character = makeCharacter({ sparkLog: CANONICAL_LOG })

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
    const result = addSpark(makeCharacter({ sparkLog: ["wisdom"] }), "focus")
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ sparkLog: ["wisdom", "focus"] }),
    })
  })

  it("fills the log up to capacity", () => {
    const result = addSpark(
      makeCharacter({ sparkLog: CANONICAL_LOG.slice(0, 6) }),
      "expression"
    )
    expect(result.ok && result.value.sparkLog).toHaveLength(7)
  })

  it("rejects a Spark once the log is full", () => {
    expect(
      addSpark(makeCharacter({ sparkLog: CANONICAL_LOG }), "wisdom")
    ).toEqual({ ok: false, error: "log-full" })
  })

  it("does not mutate the input character or its log", () => {
    const log: SparkLog = ["wisdom"]
    const character = makeCharacter({ sparkLog: log })
    addSpark(character, "focus")
    expect(log).toEqual(["wisdom"])
    expect(character.sparkLog).toBe(log)
  })
})

describe("eligibleVirtuesForRankUp", () => {
  it("returns an empty set for a log below capacity", () => {
    const character = makeCharacter({ sparkLog: CANONICAL_LOG.slice(0, 6) })
    expect(eligibleVirtuesForRankUp(character).size).toBe(0)
  })

  it("returns the distinct Virtues of a full log", () => {
    const character = makeCharacter({
      sparkLog: ["focus", "focus", "focus", "focus", "focus", "focus", "focus"],
    })
    expect(eligibleVirtuesForRankUp(character)).toEqual(
      new Set<VirtueKey>(["focus"])
    )
  })
})

describe("rankUpVirtue", () => {
  it("increments only the chosen Virtue and clears the log", () => {
    const character = makeCharacter({
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
    const character = makeCharacter({ sparkLog: CANONICAL_LOG, virtues })
    expect(rankUpVirtue(character, "expression")).toEqual({
      ok: false,
      error: "virtue-not-eligible",
    })
    expect(character.virtues).toBe(virtues)
    expect(character.sparkLog).toEqual(CANONICAL_LOG)
  })

  it("rejects rank-up when the log is not exactly full", () => {
    const character = makeCharacter({ sparkLog: CANONICAL_LOG.slice(0, 6) })
    expect(rankUpVirtue(character, "wisdom")).toEqual({
      ok: false,
      error: "log-not-full",
    })
  })

  it("rejects rank-up at the rank ceiling and preserves the log", () => {
    const character = makeCharacter({
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
    const character = makeCharacter({ sparkLog: log, virtues })
    rankUpVirtue(character, "focus")
    expect(character.sparkLog).toBe(log)
    expect(log).toEqual(CANONICAL_LOG)
    expect(character.virtues).toBe(virtues)
    expect(virtues.focus).toBe(0)
  })
})
