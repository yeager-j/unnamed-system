import { describe, expect, it } from "vitest"

import { refCountLine } from "./world-detail"

describe("refCountLine", () => {
  it("says nowhere-yet when clean", () => {
    expect(refCountLine({ relations: 0, updates: 0, beatMentions: 0 })).toBe(
      "Referenced nowhere yet."
    )
  })

  it("pluralizes and joins the non-zero parts", () => {
    expect(refCountLine({ relations: 1, updates: 0, beatMentions: 0 })).toBe(
      "Referenced by 1 relation."
    )
    expect(refCountLine({ relations: 2, updates: 0, beatMentions: 1 })).toBe(
      "Referenced by 2 relations and 1 beat."
    )
    expect(refCountLine({ relations: 2, updates: 3, beatMentions: 1 })).toBe(
      "Referenced by 2 relations, 3 updates, and 1 beat."
    )
  })
})
