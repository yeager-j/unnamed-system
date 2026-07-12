import { describe, expect, it } from "vitest"

import { dayProgress } from "./day-progress"

describe("dayProgress", () => {
  it("counts a story slot once and a downtime slot per roster member", () => {
    const progress = dayProgress({
      slotIds: ["s1", "s2"],
      occupancy: { storyBeatSlotIds: new Set(["s1"]) },
      resolvedBeatSlotIds: new Set(),
      rosterSize: 5,
      recordedBySlot: new Map([["s2", 3]]),
    })
    expect(progress).toEqual({ done: 3, total: 6 })
  })

  it("counts a resolved story beat as done", () => {
    const progress = dayProgress({
      slotIds: ["s1"],
      occupancy: { storyBeatSlotIds: new Set(["s1"]) },
      resolvedBeatSlotIds: new Set(["s1"]),
      rosterSize: 5,
      recordedBySlot: new Map(),
    })
    expect(progress).toEqual({ done: 1, total: 1 })
  })

  it("caps recorded entries at the current roster (roster drift accepted)", () => {
    const progress = dayProgress({
      slotIds: ["s1"],
      occupancy: { storyBeatSlotIds: new Set() },
      resolvedBeatSlotIds: new Set(),
      rosterSize: 2,
      recordedBySlot: new Map([["s1", 4]]),
    })
    expect(progress).toEqual({ done: 2, total: 2 })
  })

  it("an empty roster contributes no downtime units", () => {
    const progress = dayProgress({
      slotIds: ["s1", "s2"],
      occupancy: { storyBeatSlotIds: new Set(["s2"]) },
      resolvedBeatSlotIds: new Set(),
      rosterSize: 0,
      recordedBySlot: new Map(),
    })
    expect(progress).toEqual({ done: 0, total: 1 })
  })
})
