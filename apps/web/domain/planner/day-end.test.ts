import { describe, expect, it } from "vitest"

import { dayEndReadiness } from "./day-end"

const emptyOccupancy = {
  storyBeatSlotIds: new Set<string>(),
  dungeonClaimSlotIds: new Set<string>(),
}

describe("dayEndReadiness", () => {
  it("counts unresolved story and dungeon slots and missing entries", () => {
    const readiness = dayEndReadiness({
      slotIds: ["s-story", "s-dungeon", "s-open"],
      occupancy: {
        storyBeatSlotIds: new Set(["s-story"]),
        dungeonClaimSlotIds: new Set(["s-dungeon"]),
      },
      resolvedSlotIds: new Set(),
      rosterSize: 3,
      recordedBySlot: new Map([["s-open", 1]]),
    })
    expect(readiness).toEqual({
      ready: false,
      unresolvedStorySlots: 1,
      unresolvedDungeonSlots: 1,
      missingEntries: 2,
    })
  })

  it("is ready exactly when every slot is resolved or fully recorded", () => {
    const readiness = dayEndReadiness({
      slotIds: ["s-story", "s-dungeon", "s-open"],
      occupancy: {
        storyBeatSlotIds: new Set(["s-story"]),
        dungeonClaimSlotIds: new Set(["s-dungeon"]),
      },
      resolvedSlotIds: new Set(["s-story", "s-dungeon"]),
      rosterSize: 2,
      recordedBySlot: new Map([["s-open", 2]]),
    })
    expect(readiness).toEqual({
      ready: true,
      unresolvedStorySlots: 0,
      unresolvedDungeonSlots: 0,
      missingEntries: 0,
    })
  })

  it("an empty roster leaves downtime slots ready (nothing to record)", () => {
    const readiness = dayEndReadiness({
      slotIds: ["s-open"],
      occupancy: emptyOccupancy,
      resolvedSlotIds: new Set(),
      rosterSize: 0,
      recordedBySlot: new Map(),
    })
    expect(readiness.ready).toBe(true)
  })

  it("caps recorded entries at the roster (drift never counts negative)", () => {
    const readiness = dayEndReadiness({
      slotIds: ["s-open"],
      occupancy: emptyOccupancy,
      resolvedSlotIds: new Set(),
      rosterSize: 1,
      recordedBySlot: new Map([["s-open", 4]]),
    })
    expect(readiness).toMatchObject({ ready: true, missingEntries: 0 })
  })
})
