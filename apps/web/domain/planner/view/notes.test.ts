import { describe, expect, it } from "vitest"

import {
  buildBeatTreeItems,
  UNTITLED_BEAT_LABEL,
  type BeatTreeInput,
} from "./notes"

function beat(
  id: string,
  folderId: string | null,
  overrides: Partial<BeatTreeInput> = {}
): BeatTreeInput {
  return {
    id,
    folderId,
    title: `Beat ${id}`,
    floating: false,
    scheduledSlot: null,
    ...overrides,
  }
}

describe("buildBeatTreeItems", () => {
  it("carries folder membership through as the tree item's folderId", () => {
    const [filed, loose] = buildBeatTreeItems([
      beat("b1", "s1"),
      beat("b2", null),
    ])
    expect(filed!.folderId).toBe("s1")
    expect(loose!.folderId).toBeNull()
  })

  it("derives the schedule glyph and tooltip from the one stored fact", () => {
    const [scheduled, floating, none] = buildBeatTreeItems([
      beat("b1", null, {
        scheduledSlot: { id: "slot1", day: 15, label: "Morning" },
      }),
      beat("b2", null, { floating: true }),
      beat("b3", null),
    ])
    expect(scheduled!.schedule).toEqual({
      icon: "scheduled",
      label: "Day 15 · Morning",
    })
    expect(floating!.schedule).toEqual({
      icon: "floating",
      label: "Floating · run anytime",
    })
    expect(none!.schedule).toEqual({ icon: "none", label: null })
  })

  it("labels a blank title as untitled and flags it for muting", () => {
    const [item] = buildBeatTreeItems([beat("b1", null, { title: "  " })])
    expect(item!.name).toBe(UNTITLED_BEAT_LABEL)
    expect(item!.isUntitled).toBe(true)
  })
})
