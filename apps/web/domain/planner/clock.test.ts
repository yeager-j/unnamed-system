import { describe, expect, it } from "vitest"

import { horizonOf, isFrozenDay } from "./clock"

describe("horizonOf", () => {
  it("is the max day over slot rows", () => {
    expect(horizonOf([{ day: 3 }, { day: 15 }, { day: 7 }])).toBe(15)
  })

  it("ignores insertion order and duplicate days", () => {
    expect(horizonOf([{ day: 9 }, { day: 9 }, { day: 2 }])).toBe(9)
  })

  it("is null with no slots (pre-clock only)", () => {
    expect(horizonOf([])).toBeNull()
  })
})

describe("isFrozenDay", () => {
  it("freezes days strictly before the current day", () => {
    expect(isFrozenDay(14, 15)).toBe(true)
  })

  it("keeps the current day writable", () => {
    expect(isFrozenDay(15, 15)).toBe(false)
  })

  it("keeps future days writable (prep is legal)", () => {
    expect(isFrozenDay(16, 15)).toBe(false)
  })
})
