import { describe, expect, it } from "vitest"

import { buildSchedulePickerDays } from "./schedule-picker"

function slot(
  id: string,
  day: number,
  ordinal: number,
  occupied?: { id: string; title: string },
  claimed?: { name: string }
) {
  return {
    id,
    day,
    ordinal,
    label: ordinal === 0 ? "Morning" : "Evening",
    occupiedByBeat: occupied ?? null,
    occupiedByDungeon: claimed ?? null,
  }
}

describe("buildSchedulePickerDays", () => {
  it("groups slots by day preserving order, labelling raw Day N without months", () => {
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

  it("reframes the day heading under an active month", () => {
    const days = buildSchedulePickerDays(
      [slot("s1", 15, 0), slot("s2", 16, 0)],
      [{ day: 13, label: "May" }]
    )
    expect(days.map((day) => day.label)).toEqual(["May 3", "May 4"])
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

  it("attributes a dungeon-claimed slot to its dungeon", () => {
    const days = buildSchedulePickerDays([
      slot("s1", 15, 0, undefined, { name: "The Drowned Vault" }),
      slot("s2", 15, 1),
    ])
    expect(days[0]!.slots[0]!.occupiedBy).toBe("The Drowned Vault")
    expect(days[0]!.full).toBe(false)
  })
})
