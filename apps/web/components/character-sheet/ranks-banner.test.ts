import { describe, expect, it } from "vitest"

import { shouldShowRanksBanner } from "./ranks-banner-visibility"

describe("shouldShowRanksBanner", () => {
  it("hides when there are no ranks to spend", () => {
    expect(shouldShowRanksBanner(0, 0)).toBe(false)
  })

  it("shows when ranks exist and the banner was never dismissed", () => {
    expect(shouldShowRanksBanner(3, 0)).toBe(true)
  })

  it("hides at the count it was dismissed at", () => {
    expect(shouldShowRanksBanner(3, 3)).toBe(false)
  })

  it("re-surfaces when a fresh grant pushes ranks above the dismissed count", () => {
    expect(shouldShowRanksBanner(5, 2)).toBe(true)
  })

  it("stays hidden after dismissing then spending while still above zero", () => {
    expect(shouldShowRanksBanner(4, 5)).toBe(false)
  })

  it("hides once ranks return to zero, regardless of dismissal state", () => {
    expect(shouldShowRanksBanner(0, 3)).toBe(false)
  })
})
