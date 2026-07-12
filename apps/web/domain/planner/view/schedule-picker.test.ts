import { describe, expect, it } from "vitest"

import { buildSchedulePickerDays } from "./schedule-picker"

function slot(
  id: string,
  day: number,
  ordinal: number,
  occupied?: { id: string; title: string }
) {
  return {
    id,
    day,
    ordinal,
    label: ordinal === 0 ? "Morning" : "Evening",
    occupiedByBeat: occupied ?? null,
  }
}

describe("buildSchedulePickerDays", () => {
  it("groups slots by day preserving order", () => {
    const days = buildSchedulePickerDays([
      slot("s1", 15, 0),
      slot("s2", 15, 1),
      slot("s3", 16, 0),
    ])
    expect(days.map((day) => day.day)).toEqual([15, 16])
    expect(days[0]!.label).toBe("Day 15")
    expect(days[0]!.slots.map((view) => view.label)).toEqual([
      "Morning",
      "Evening",
    ])
  })

  it("carries occupancy and marks full days", () => {
    const days = buildSchedulePickerDays([
      slot("s1", 15, 0, { id: "b1", title: "The Queen's Offer" }),
      slot("s2", 15, 1, { id: "b2", title: "  " }),
      slot("s3", 16, 0),
    ])
    expect(days[0]!.full).toBe(true)
    expect(days[0]!.slots[0]!.occupiedBy).toBe("The Queen's Offer")
    expect(days[0]!.slots[1]!.occupiedBy).toBe("Untitled beat")
    expect(days[1]!.full).toBe(false)
  })
})
