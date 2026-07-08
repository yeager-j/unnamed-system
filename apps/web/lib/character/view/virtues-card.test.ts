import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { Virtues } from "@workspace/game-v2/virtues"

import { buildVirtuesCardView } from "./virtues-card"

function bard(virtues?: Virtues): Entity {
  return {
    id: "virtues-card-test",
    components: virtues ? { virtues } : {},
  }
}

const fullLog = [
  "wisdom",
  "wisdom",
  "empathy",
  "focus",
  "wisdom",
  "empathy",
  "focus",
] as const

describe("buildVirtuesCardView", () => {
  it("shapes rank rows, the spark fill, and the breakdown line", () => {
    const view = buildVirtuesCardView(
      bard({
        ranks: { expression: 0, empathy: 2, wisdom: 1, focus: 1 },
        sparkLog: ["wisdom", "wisdom", "empathy"],
      })
    )

    expect(view.rows).toEqual([
      { virtue: "expression", rank: 0 },
      { virtue: "empathy", rank: 2 },
      { virtue: "wisdom", rank: 1 },
      { virtue: "focus", rank: 1 },
    ])
    expect(view.sparkCount).toBe(3)
    expect(view.sparkCapacity).toBe(7)
    expect(view.breakdown).toEqual([
      { virtue: "wisdom", count: 2 },
      { virtue: "empathy", count: 1 },
    ])
    expect(view.logFull).toBe(false)
    // Eligibility only exists at a full log.
    expect(view.eligible).toEqual([])
  })

  it("marks a full log with VIRTUE_KEYS-ordered eligibility", () => {
    const view = buildVirtuesCardView(
      bard({
        ranks: { expression: 0, empathy: 0, wisdom: 7, focus: 0 },
        sparkLog: [...fullLog],
      })
    )

    expect(view.logFull).toBe(true)
    expect(view.eligible).toEqual(["empathy", "wisdom", "focus"])
    expect(view.rankCapped.wisdom).toBe(true)
    expect(view.rankCapped.empathy).toBe(false)
  })

  it("tolerates an absent virtues component (all zero, empty log)", () => {
    const view = buildVirtuesCardView(bard())

    expect(view.rows.map((row) => row.rank)).toEqual([0, 0, 0, 0])
    expect(view.sparkCount).toBe(0)
    expect(view.breakdown).toEqual([])
    expect(view.logFull).toBe(false)
    expect(view.eligible).toEqual([])
  })
})
