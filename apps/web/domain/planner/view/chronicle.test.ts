import { describe, expect, it } from "vitest"

import { isShownByDefaultInChronicle } from "./chronicle"

describe("isShownByDefaultInChronicle", () => {
  it("filters idle entries out by default", () => {
    expect(isShownByDefaultInChronicle({ category: "idle" })).toBe(false)
  })

  it("shows categorized downtime and uncategorized world updates", () => {
    expect(isShownByDefaultInChronicle({ category: "virtue" })).toBe(true)
    expect(isShownByDefaultInChronicle({ category: "collaborator" })).toBe(true)
    expect(isShownByDefaultInChronicle({ category: null })).toBe(true)
  })
})
