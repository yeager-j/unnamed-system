import { describe, expect, it } from "vitest"

import { ARCANA } from "./arcana"

describe("ARCANA", () => {
  it("carries all 22 Major Arcana", () => {
    expect(ARCANA).toHaveLength(22)
    expect(new Set(ARCANA.map((a) => a.label)).size).toBe(22)
  })

  it("cautions exactly the three the Toolkit omits", () => {
    const cautioned = ARCANA.filter((a) => a.caution !== undefined)
    expect(cautioned.map((a) => a.label)).toEqual([
      "The Fool",
      "Judgement",
      "The World",
    ])
  })
})
