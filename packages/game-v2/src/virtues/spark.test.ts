import { describe, expect, it } from "vitest"

import { VIRTUE_KEYS, type VirtueKey } from "@workspace/game-v2/kernel/vocab"
import {
  addSpark,
  eligibleVirtuesForRankUp,
  rankUpVirtue,
  sparkLogBreakdown,
} from "@workspace/game-v2/virtues/spark"
import type {
  SparkLog,
  VirtueRanks,
  Virtues,
} from "@workspace/game-v2/virtues/virtues.schema"

/** Default: empty log, every Virtue at Rank 0. Overridable per test. */
function makeVirtues(overrides: Partial<Virtues> = {}): Virtues {
  return {
    ranks: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
    sparkLog: [],
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
  const virtues = makeVirtues({ sparkLog: CANONICAL_LOG })

  it("makes exactly Wisdom, Empathy, and Focus eligible", () => {
    expect(eligibleVirtuesForRankUp(virtues)).toEqual(
      new Set<VirtueKey>(["wisdom", "empathy", "focus"])
    )
  })

  it.each<VirtueKey>(["wisdom", "empathy", "focus"])(
    "allows ranking up %s",
    (virtue) => {
      const result = rankUpVirtue(virtues, virtue)
      expect(result.ok).toBe(true)
    }
  )

  it("does not allow ranking up Expression", () => {
    expect(rankUpVirtue(virtues, "expression")).toEqual({
      ok: false,
      error: "virtue-not-eligible",
    })
  })
})

describe("addSpark", () => {
  it("appends the tagged Virtue to a non-full log", () => {
    const result = addSpark(makeVirtues({ sparkLog: ["wisdom"] }), "focus")
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ sparkLog: ["wisdom", "focus"] }),
    })
  })

  it("fills the log up to capacity", () => {
    const result = addSpark(
      makeVirtues({ sparkLog: CANONICAL_LOG.slice(0, 6) }),
      "expression"
    )
    expect(result.ok && result.value.sparkLog).toHaveLength(7)
  })

  it("rejects a Spark once the log is full", () => {
    expect(
      addSpark(makeVirtues({ sparkLog: CANONICAL_LOG }), "wisdom")
    ).toEqual({ ok: false, error: "log-full" })
  })

  it("does not mutate the input virtues or its log", () => {
    const log: SparkLog = ["wisdom"]
    const virtues = makeVirtues({ sparkLog: log })
    addSpark(virtues, "focus")
    expect(log).toEqual(["wisdom"])
    expect(virtues.sparkLog).toBe(log)
  })
})

describe("eligibleVirtuesForRankUp", () => {
  it("returns an empty set for a log below capacity", () => {
    const virtues = makeVirtues({ sparkLog: CANONICAL_LOG.slice(0, 6) })
    expect(eligibleVirtuesForRankUp(virtues).size).toBe(0)
  })

  it("returns the distinct Virtues of a full log", () => {
    const virtues = makeVirtues({
      sparkLog: ["focus", "focus", "focus", "focus", "focus", "focus", "focus"],
    })
    expect(eligibleVirtuesForRankUp(virtues)).toEqual(
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

  it("keeps VIRTUE_KEYS canonical order as the tiebreak base", () => {
    // All four at count 1 — pure tiebreak, so the output is VIRTUE_KEYS order.
    expect(sparkLogBreakdown([...VIRTUE_KEYS]).map((e) => e.virtue)).toEqual([
      ...VIRTUE_KEYS,
    ])
  })
})

describe("rankUpVirtue", () => {
  it("increments only the chosen Virtue and clears the log", () => {
    const virtues = makeVirtues({
      sparkLog: CANONICAL_LOG,
      ranks: { expression: 1, empathy: 2, wisdom: 3, focus: 0 },
    })
    const result = rankUpVirtue(virtues, "wisdom")
    expect(result).toEqual({
      ok: true,
      value: {
        sparkLog: [],
        ranks: { expression: 1, empathy: 2, wisdom: 4, focus: 0 },
      },
    })
  })

  it("rejects a Virtue absent from the log without mutating", () => {
    const ranks: VirtueRanks = {
      expression: 0,
      empathy: 0,
      wisdom: 0,
      focus: 0,
    }
    const virtues = makeVirtues({ sparkLog: CANONICAL_LOG, ranks })
    expect(rankUpVirtue(virtues, "expression")).toEqual({
      ok: false,
      error: "virtue-not-eligible",
    })
    expect(virtues.ranks).toBe(ranks)
    expect(virtues.sparkLog).toEqual(CANONICAL_LOG)
  })

  it("rejects rank-up when the log is not exactly full", () => {
    const virtues = makeVirtues({ sparkLog: CANONICAL_LOG.slice(0, 6) })
    expect(rankUpVirtue(virtues, "wisdom")).toEqual({
      ok: false,
      error: "log-not-full",
    })
  })

  it("rejects rank-up at the rank ceiling and preserves the log", () => {
    const virtues = makeVirtues({
      sparkLog: CANONICAL_LOG,
      ranks: { expression: 0, empathy: 0, wisdom: 7, focus: 0 },
    })
    const result = rankUpVirtue(virtues, "wisdom")
    expect(result).toEqual({ ok: false, error: "rank-capped" })
    expect(virtues.sparkLog).toEqual(CANONICAL_LOG)
  })

  it("does not mutate the input on success", () => {
    const log = [...CANONICAL_LOG]
    const ranks: VirtueRanks = {
      expression: 0,
      empathy: 0,
      wisdom: 0,
      focus: 0,
    }
    const virtues = makeVirtues({ sparkLog: log, ranks })
    rankUpVirtue(virtues, "focus")
    expect(virtues.sparkLog).toBe(log)
    expect(log).toEqual(CANONICAL_LOG)
    expect(virtues.ranks).toBe(ranks)
    expect(ranks.focus).toBe(0)
  })
})
