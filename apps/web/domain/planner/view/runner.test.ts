import { describe, expect, it } from "vitest"

import { buildRunnerSlotViews } from "./runner"

const SLOTS = [
  { id: "s1", ordinal: 0, label: "Morning" },
  { id: "s2", ordinal: 1, label: "Evening" },
]

const NO_BEATS = new Map<
  string,
  {
    id: string
    title: string
    tagline: string
    body: string
    resolvedAt: Date | null
  }
>()

const NO_CLAIMS = new Map<
  string,
  { dungeonId: string; shortId: string; name: string; resolvedAt: Date | null }
>()

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
            body: "The party is approached.",
            resolvedAt: null,
          },
        ],
      ]),
      claimsBySlot: NO_CLAIMS,
      rosterSize: 5,
      recordedBySlot: new Map([["s2", 4]]),
    })

    expect(views[0]).toMatchObject({
      kind: "story",
      meta: "Story · The Queen's Offer",
      done: false,
      beat: { id: "b1", resolved: false, body: "The party is approached." },
      dungeon: null,
    })
    expect(views[1]).toMatchObject({
      kind: "downtime",
      meta: "Downtime · 4 / 5 recorded",
      done: false,
      beat: null,
    })
  })

  it("forks a dungeon slot on its claim", () => {
    const views = buildRunnerSlotViews({
      slots: SLOTS,
      beatsBySlot: NO_BEATS,
      claimsBySlot: new Map([
        [
          "s1",
          {
            dungeonId: "d1",
            shortId: "dg123456",
            name: "The Drowned Vault",
            resolvedAt: null,
          },
        ],
        [
          "s2",
          {
            dungeonId: "d1",
            shortId: "dg123456",
            name: "The Drowned Vault",
            resolvedAt: new Date(),
          },
        ],
      ]),
      rosterSize: 5,
      recordedBySlot: new Map(),
    })

    expect(views[0]).toMatchObject({
      kind: "dungeon",
      meta: "Dungeon · The Drowned Vault",
      done: false,
      dungeon: { dungeonId: "d1", shortId: "dg123456", resolved: false },
      beat: null,
    })
    expect(views[1]).toMatchObject({ kind: "dungeon", done: true })
  })

  it("marks a resolved beat and a fully recorded downtime slot done", () => {
    const views = buildRunnerSlotViews({
      slots: SLOTS,
      beatsBySlot: new Map([
        [
          "s1",
          {
            id: "b1",
            title: "T",
            tagline: "",
            body: "",
            resolvedAt: new Date(),
          },
        ],
      ]),
      claimsBySlot: NO_CLAIMS,
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
        [
          "s1",
          { id: "b1", title: "  ", tagline: "", body: "", resolvedAt: null },
        ],
      ]),
      claimsBySlot: NO_CLAIMS,
      rosterSize: 0,
      recordedBySlot: new Map(),
    })
    expect(views[0]!.meta).toBe("Story · Untitled beat")
    expect(views[1]!.meta).toBe("Downtime")
    expect(views[1]!.done).toBe(false)
  })
})
