import { describe, expect, it } from "vitest"

import {
  buildNotesTree,
  filterNotesTree,
  UNTITLED_BEAT_LABEL,
} from "./notes-tree"

const SESSIONS = [
  { id: "s1", name: "Session 8 — The Queen's Gambit" },
  { id: "s2", name: "Lore & Setup" },
]

function beat(
  id: string,
  sessionId: string | null,
  overrides: Partial<Parameters<typeof buildNotesTree>[1][number]> = {}
) {
  return {
    id,
    sessionId,
    title: `Beat ${id}`,
    floating: false,
    scheduledSlot: null,
    ...overrides,
  }
}

describe("buildNotesTree", () => {
  it("groups beats under their sessions in input order", () => {
    const tree = buildNotesTree(SESSIONS, [
      beat("b1", "s1"),
      beat("b2", "s2"),
      beat("b3", "s1"),
    ])
    expect(tree.map((folder) => folder.sessionId)).toEqual(["s1", "s2"])
    expect(tree[0]!.beats.map((view) => view.id)).toEqual(["b1", "b3"])
    expect(tree[1]!.beats.map((view) => view.id)).toEqual(["b2"])
  })

  it("appends a virtual Unfiled folder only when sessionless beats exist", () => {
    expect(buildNotesTree(SESSIONS, [beat("b1", "s1")])).toHaveLength(2)

    const withUnfiled = buildNotesTree(SESSIONS, [beat("b1", null)])
    expect(withUnfiled).toHaveLength(3)
    expect(withUnfiled[2]).toMatchObject({
      sessionId: null,
      name: "Unfiled",
    })
    expect(withUnfiled[2]!.beats.map((view) => view.id)).toEqual(["b1"])
  })

  it("keeps empty sessions (a fresh folder is a real thing)", () => {
    const tree = buildNotesTree(SESSIONS, [])
    expect(tree).toHaveLength(2)
    expect(tree[0]!.beats).toEqual([])
  })

  it("derives the schedule icon + label from the one stored fact", () => {
    const tree = buildNotesTree(
      [],
      [
        beat("b1", null, {
          scheduledSlot: { id: "slot", day: 15, label: "Morning" },
        }),
        beat("b2", null, { floating: true }),
        beat("b3", null),
      ]
    )
    expect(tree[0]!.beats).toEqual([
      expect.objectContaining({
        scheduleIcon: "scheduled",
        scheduleLabel: "Day 15 · Morning",
      }),
      expect.objectContaining({
        scheduleIcon: "floating",
        scheduleLabel: "Floating · run anytime",
      }),
      expect.objectContaining({ scheduleIcon: "none", scheduleLabel: null }),
    ])
  })

  it("labels an empty title Untitled", () => {
    const tree = buildNotesTree([], [beat("b1", null, { title: "  " })])
    expect(tree[0]!.beats[0]!.title).toBe(UNTITLED_BEAT_LABEL)
  })
})

describe("filterNotesTree", () => {
  const tree = buildNotesTree(SESSIONS, [
    beat("b1", "s1", { title: "The Queen's Offer" }),
    beat("b2", "s1", { title: "Ambush on the Salt Road" }),
    beat("b3", "s2", { title: "Campaign Primer" }),
  ])

  it("returns everything for an empty query", () => {
    expect(filterNotesTree(tree, "  ")).toEqual(tree)
  })

  it("narrows folders to matching beats", () => {
    const filtered = filterNotesTree(tree, "queen's offer")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.beats.map((view) => view.id)).toEqual(["b1"])
  })

  it("keeps a whole folder on a session-name match", () => {
    const filtered = filterNotesTree(tree, "lore")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.beats.map((view) => view.id)).toEqual(["b3"])
  })

  it("drops folders with no match", () => {
    expect(filterNotesTree(tree, "dragon")).toEqual([])
  })
})
