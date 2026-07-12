import { describe, expect, it } from "vitest"

import { buildRunnerSlotViews } from "./runner"

const SLOTS = [
  { id: "s1", ordinal: 0, label: "Morning" },
  { id: "s2", ordinal: 1, label: "Evening" },
]

describe("buildRunnerSlotViews", () => {
  it("forks story vs downtime on the scheduled beat (kind derived once)", () => {
    const views = buildRunnerSlotViews({
      slots: SLOTS,
      beatsBySlot: new Map([
        [
          "s1",
          {
            id: "b1",
            title: "The Queen's Offer",
            tagline: "She wants the ledger.",
            resolvedAt: null,
          },
        ],
      ]),
      rosterSize: 5,
      recordedBySlot: new Map([["s2", 4]]),
    })

    expect(views[0]).toMatchObject({
      kind: "story",
      meta: "Story · The Queen's Offer",
      done: false,
      beat: { id: "b1", resolved: false },
    })
    expect(views[1]).toMatchObject({
      kind: "downtime",
      meta: "Downtime · 4 / 5 recorded",
      done: false,
      beat: null,
    })
  })

  it("marks a resolved beat and a fully recorded downtime slot done", () => {
    const views = buildRunnerSlotViews({
      slots: SLOTS,
      beatsBySlot: new Map([
        ["s1", { id: "b1", title: "T", tagline: "", resolvedAt: new Date() }],
      ]),
      rosterSize: 2,
      recordedBySlot: new Map([["s2", 2]]),
    })
    expect(views[0]!.done).toBe(true)
    expect(views[1]!.done).toBe(true)
  })

  it("labels an untitled beat and an empty roster honestly", () => {
    const views = buildRunnerSlotViews({
      slots: SLOTS,
      beatsBySlot: new Map([
        ["s1", { id: "b1", title: "  ", tagline: "", resolvedAt: null }],
      ]),
      rosterSize: 0,
      recordedBySlot: new Map(),
    })
    expect(views[0]!.meta).toBe("Story · Untitled beat")
    expect(views[1]!.meta).toBe("Downtime")
    expect(views[1]!.done).toBe(false)
  })
})
