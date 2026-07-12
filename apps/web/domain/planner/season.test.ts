import { describe, expect, it } from "vitest"

import { seasonOf } from "./season"

const seasons = [
  { day: 20, label: "High Summer" },
  { day: 5, label: "Late Thaw" },
]

describe("seasonOf", () => {
  it("is null before the first marker", () => {
    expect(seasonOf(seasons, 4)).toBeNull()
  })

  it("starts on the marker's own day", () => {
    expect(seasonOf(seasons, 5)).toBe("Late Thaw")
  })

  it("inherits forward until the next marker", () => {
    expect(seasonOf(seasons, 19)).toBe("Late Thaw")
    expect(seasonOf(seasons, 20)).toBe("High Summer")
  })

  it("inherits forward indefinitely past the last marker", () => {
    expect(seasonOf(seasons, 999)).toBe("High Summer")
  })

  it("does not depend on marker ordering", () => {
    expect(seasonOf([...seasons].reverse(), 21)).toBe("High Summer")
  })

  it("is null with no markers", () => {
    expect(seasonOf([], 10)).toBeNull()
  })
})
