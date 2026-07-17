import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { d100Ranges } from "./d100-ranges"
import type { ContentTable } from "./template-set.schema"

/** Builds a minimal {@link ContentTable} carrying just the row weights the
 *  projection reads — entries are irrelevant to the d100 bands. */
function tableOfWeights(weights: number[]): ContentTable {
  return {
    key: "t",
    name: "",
    rows: weights.map((weight) => ({ weight, entries: [] })),
  }
}

describe("d100Ranges — examples", () => {
  it("gives a single row the whole 1–100 band", () => {
    expect(d100Ranges(tableOfWeights([5]))).toEqual([{ min: 1, max: 100 }])
  })

  it("splits 60/40 into 1–60 and 61–100", () => {
    expect(d100Ranges(tableOfWeights([60, 40]))).toEqual([
      { min: 1, max: 60 },
      { min: 61, max: 100 },
    ])
  })

  it("breaks a remainder tie toward the lower row index", () => {
    // Three equal weights: 97 units over three rows floor to 32 each with one
    // unit left over and identical remainders — the tie hands it to row 0, so
    // row 0's band is one wider than the other two.
    expect(d100Ranges(tableOfWeights([1, 1, 1]))).toEqual([
      { min: 1, max: 34 },
      { min: 35, max: 67 },
      { min: 68, max: 100 },
    ])
  })

  it("returns [] for a table with no rows", () => {
    expect(d100Ranges(tableOfWeights([]))).toEqual([])
  })

  it("returns null past 100 rows", () => {
    expect(d100Ranges(tableOfWeights(Array(101).fill(1)))).toBeNull()
  })
})

const weightsArb = (min: number, max: number) =>
  fc.array(fc.integer({ min: 0, max: 1000 }), {
    minLength: min,
    maxLength: max,
  })

describe("d100Ranges — properties", () => {
  it("packs 1..100 contiguously with every band at least width 1", () => {
    fc.assert(
      fc.property(weightsArb(1, 100), (weights) => {
        const ranges = d100Ranges(tableOfWeights(weights))!
        expect(ranges).not.toBeNull()
        expect(ranges).toHaveLength(weights.length)
        expect(ranges[0]!.min).toBe(1)
        expect(ranges.at(-1)!.max).toBe(100)
        for (let i = 0; i < ranges.length; i += 1) {
          expect(ranges[i]!.max).toBeGreaterThanOrEqual(ranges[i]!.min)
          if (i > 0) expect(ranges[i]!.min).toBe(ranges[i - 1]!.max + 1)
        }
      })
    )
  })

  it("keeps band width monotone with weight order (wᵢ ≥ wⱼ ⇒ widthᵢ ≥ widthⱼ, i<j)", () => {
    fc.assert(
      fc.property(weightsArb(1, 60), (weights) => {
        const ranges = d100Ranges(tableOfWeights(weights))!
        const width = (i: number) => ranges[i]!.max - ranges[i]!.min + 1
        for (let i = 0; i < weights.length; i += 1) {
          for (let j = i + 1; j < weights.length; j += 1) {
            if (weights[i]! >= weights[j]!) {
              expect(width(i)).toBeGreaterThanOrEqual(width(j))
            }
          }
        }
      })
    )
  })

  it("is deterministic — two calls are byte-identical", () => {
    fc.assert(
      fc.property(weightsArb(1, 100), (weights) => {
        expect(d100Ranges(tableOfWeights(weights))).toStrictEqual(
          d100Ranges(tableOfWeights(weights))
        )
      })
    )
  })

  it("returns null for any table over 100 rows", () => {
    fc.assert(
      fc.property(weightsArb(101, 160), (weights) => {
        expect(d100Ranges(tableOfWeights(weights))).toBeNull()
      })
    )
  })

  it("falls back to near-equal bands when all weights are zero", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        const ranges = d100Ranges(tableOfWeights(Array(n).fill(0)))!
        const widths = ranges.map((r) => r.max - r.min + 1)
        expect(widths.reduce((sum, w) => sum + w, 0)).toBe(100)
        const floor = Math.floor(100 / n)
        for (const w of widths) {
          expect(w === floor || w === floor + 1).toBe(true)
        }
      })
    )
  })
})
