import { describe, expect, it } from "vitest"

import { previewSummary } from "./participant-preview"

describe("previewSummary", () => {
  it("collapses a chip-bearing body into plain prose", () => {
    expect(
      previewSummary(
        "The tide-wardens answer to [[npc:n1|Maren]],\nnot the crown."
      )
    ).toBe("The tide-wardens answer to Maren, not the crown.")
  })

  it("trails off at the last whole word inside the limit", () => {
    const summary = previewSummary(`${"tide ".repeat(40)}wardens`)

    expect(summary).toMatch(/…$/)
    expect(summary).not.toMatch(/ …$/)
    expect(summary!.length).toBeLessThanOrEqual(141)
  })

  it("reads an empty body as no summary at all", () => {
    expect(previewSummary("   \n\n ")).toBeNull()
  })
})
