import { describe, expect, it } from "vitest"

import {
  describeAllocationProgress,
  isValidCreationAllocation,
  wouldExceedAllocationCap,
  ZERO_VIRTUE_ALLOCATION,
  type VirtueAllocation,
} from "./allocation"

describe("isValidCreationAllocation", () => {
  it("accepts the canonical one-+2-two-+1s shape", () => {
    expect(
      isValidCreationAllocation({
        expression: 2,
        empathy: 1,
        wisdom: 1,
        focus: 0,
      })
    ).toBe(true)
    expect(
      isValidCreationAllocation({
        expression: 0,
        empathy: 1,
        wisdom: 1,
        focus: 2,
      })
    ).toBe(true)
  })

  it("rejects the freshly seeded all-zeros allocation", () => {
    expect(isValidCreationAllocation(ZERO_VIRTUE_ALLOCATION)).toBe(false)
  })

  it("rejects partial allocations", () => {
    expect(
      isValidCreationAllocation({
        expression: 2,
        empathy: 1,
        wisdom: 0,
        focus: 0,
      })
    ).toBe(false)
    expect(
      isValidCreationAllocation({
        expression: 0,
        empathy: 1,
        wisdom: 1,
        focus: 0,
      })
    ).toBe(false)
  })

  it("rejects too-many +2s or +1s", () => {
    expect(
      isValidCreationAllocation({
        expression: 2,
        empathy: 2,
        wisdom: 1,
        focus: 0,
      })
    ).toBe(false)
    expect(
      isValidCreationAllocation({
        expression: 1,
        empathy: 1,
        wisdom: 1,
        focus: 0,
      })
    ).toBe(false)
  })

  it("rejects ranks outside the {0,1,2} domain", () => {
    expect(
      isValidCreationAllocation({
        expression: 3,
        empathy: 1,
        wisdom: 1,
        focus: 0,
      })
    ).toBe(false)
    expect(
      isValidCreationAllocation({
        expression: 2,
        empathy: 1,
        wisdom: 1,
        focus: -1,
      })
    ).toBe(false)
  })
})

describe("describeAllocationProgress", () => {
  it("describes a fresh allocation as needing all three picks", () => {
    const progress = describeAllocationProgress(ZERO_VIRTUE_ALLOCATION)
    expect(progress.valid).toBe(false)
    expect(progress.plusTwo).toBeNull()
    expect(progress.plusOnes).toEqual([])
    expect(progress.remaining).toEqual({ plusTwo: true, plusOnes: 2 })
  })

  it("describes a complete valid allocation", () => {
    const progress = describeAllocationProgress({
      expression: 2,
      empathy: 1,
      wisdom: 1,
      focus: 0,
    })
    expect(progress.valid).toBe(true)
    expect(progress.plusTwo).toBe("expression")
    expect(progress.plusOnes).toEqual(["empathy", "wisdom"])
    expect(progress.remaining).toEqual({ plusTwo: false, plusOnes: 0 })
  })

  it("flags overflow (too many +1s) as not valid without claiming remaining picks", () => {
    const progress = describeAllocationProgress({
      expression: 2,
      empathy: 1,
      wisdom: 1,
      focus: 1,
    })
    expect(progress.valid).toBe(false)
    // No "remaining" count to surface — UI falls back to a generic nudge.
    expect(progress.remaining.plusOnes).toBe(0)
  })
})

describe("wouldExceedAllocationCap", () => {
  const oneTwoTwoOnes: VirtueAllocation = {
    expression: 2,
    empathy: 1,
    wisdom: 1,
    focus: 0,
  }

  it("never blocks clearing a rank", () => {
    expect(wouldExceedAllocationCap(oneTwoTwoOnes, "expression", 0)).toBe(false)
    expect(wouldExceedAllocationCap(oneTwoTwoOnes, "empathy", 0)).toBe(false)
  })

  it("never blocks re-selecting the current rank", () => {
    expect(wouldExceedAllocationCap(oneTwoTwoOnes, "expression", 2)).toBe(false)
    expect(wouldExceedAllocationCap(oneTwoTwoOnes, "empathy", 1)).toBe(false)
  })

  it("blocks a second +2", () => {
    expect(wouldExceedAllocationCap(oneTwoTwoOnes, "focus", 2)).toBe(true)
  })

  it("blocks a third +1", () => {
    expect(wouldExceedAllocationCap(oneTwoTwoOnes, "focus", 1)).toBe(true)
  })
})
