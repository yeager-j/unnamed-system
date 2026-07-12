import { describe, expect, it } from "vitest"

import { isSetAside, slotKind } from "./slot-kind"

const occupancy = {
  storyBeatSlotIds: new Set(["s-story"]),
  dungeonClaimSlotIds: new Set(["s-dungeon"]),
}

describe("slotKind", () => {
  it("derives story from a beat, dungeon from a claim, downtime otherwise", () => {
    expect(slotKind("s-story", occupancy)).toBe("story")
    expect(slotKind("s-dungeon", occupancy)).toBe("dungeon")
    expect(slotKind("s-open", occupancy)).toBe("downtime")
  })
})

describe("isSetAside", () => {
  it("suppresses a slotted entry whose slot holds a beat", () => {
    expect(isSetAside({ slotId: "s-story" }, occupancy)).toBe(true)
  })

  it("suppresses a slotted entry whose slot holds a dungeon claim", () => {
    expect(isSetAside({ slotId: "s-dungeon" }, occupancy)).toBe(true)
  })

  it("keeps a downtime-slot entry visible", () => {
    expect(isSetAside({ slotId: "s-open" }, occupancy)).toBe(false)
  })

  it("never sets aside a world update", () => {
    expect(isSetAside({ slotId: null }, occupancy)).toBe(false)
  })
})
