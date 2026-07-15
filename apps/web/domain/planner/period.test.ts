import { describe, expect, it } from "vitest"

import {
  activePeriod,
  groupPeriodsByKind,
  monthDate,
  periodOf,
  resolveDayLabel,
} from "./period"

const markers = [
  { day: 20, label: "High Summer" },
  { day: 5, label: "Late Thaw" },
]

describe("periodOf / activePeriod", () => {
  it("is null before the first marker", () => {
    expect(periodOf(markers, 4)).toBeNull()
    expect(activePeriod(markers, 4)).toBeNull()
  })

  it("starts on the marker's own day", () => {
    expect(periodOf(markers, 5)).toBe("Late Thaw")
    expect(activePeriod(markers, 5)).toEqual({ day: 5, label: "Late Thaw" })
  })

  it("inherits forward until the next marker", () => {
    expect(periodOf(markers, 19)).toBe("Late Thaw")
    expect(periodOf(markers, 20)).toBe("High Summer")
  })

  it("inherits forward indefinitely past the last marker", () => {
    expect(periodOf(markers, 999)).toBe("High Summer")
  })

  it("does not depend on marker ordering", () => {
    expect(periodOf([...markers].reverse(), 21)).toBe("High Summer")
    expect(activePeriod([...markers].reverse(), 21)).toEqual({
      day: 20,
      label: "High Summer",
    })
  })

  it("is null with no markers", () => {
    expect(periodOf([], 10)).toBeNull()
    expect(activePeriod([], 10)).toBeNull()
  })
})

describe("monthDate", () => {
  const may = { day: 43, label: "May" }

  it("counts the in-month ordinal from the marker's start day", () => {
    expect(monthDate(43, may)).toBe("May 1")
    expect(monthDate(45, may)).toBe("May 3")
    expect(monthDate(102, may)).toBe("May 60")
  })

  it("is null with no active month", () => {
    expect(monthDate(45, null)).toBeNull()
  })

  it("falls back to the previous month's numbering when the later one clears", () => {
    // With April active (from day 40) and no May marker, day 45 reads April 6.
    const april = activePeriod([{ day: 40, label: "April" }], 45)
    expect(monthDate(45, april)).toBe("April 6")
  })
})

describe("resolveDayLabel", () => {
  it("is the in-month date under an active month", () => {
    expect(resolveDayLabel(45, { day: 43, label: "May" })).toBe("May 3")
  })

  it("falls back to raw Day N with no active month", () => {
    expect(resolveDayLabel(45, null)).toBe("Day 45")
  })
})

describe("groupPeriodsByKind", () => {
  it("partitions rows into season + month lists, order preserved", () => {
    const grouped = groupPeriodsByKind([
      { kind: "season", day: 1, label: "Late Thaw" },
      { kind: "month", day: 1, label: "March" },
      { kind: "month", day: 31, label: "April" },
      { kind: "season", day: 28, label: "The Long Green" },
    ])
    expect(grouped.season).toEqual([
      { kind: "season", day: 1, label: "Late Thaw" },
      { kind: "season", day: 28, label: "The Long Green" },
    ])
    expect(grouped.month).toEqual([
      { kind: "month", day: 1, label: "March" },
      { kind: "month", day: 31, label: "April" },
    ])
  })

  it("yields empty lists with no rows", () => {
    expect(groupPeriodsByKind([])).toEqual({ season: [], month: [] })
  })
})
