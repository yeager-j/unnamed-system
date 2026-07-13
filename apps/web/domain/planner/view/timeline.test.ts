import { describe, expect, it } from "vitest"

import type { ParticipantHitsByKind, ParticipantRef } from "../participant"
import { buildTimelineDayViews, type TimelineUpdateInput } from "./timeline"

const SELF: ParticipantRef = { kind: "npc", id: "npc-1" }

const HITS: ParticipantHitsByKind = {
  npc: new Map([
    ["npc-1", { name: "Vell", deletedAt: null }],
    ["npc-2", { name: "Maren", deletedAt: null }],
  ]),
  article: new Map([
    ["art-1", { name: "The Old Keep", deletedAt: new Date() }],
    ["art-2", { name: "Rise of the Demon Lord", deletedAt: null }],
  ]),
  character: new Map(),
}

function update(
  id: string,
  day: number,
  overrides: Partial<TimelineUpdateInput> = {}
): TimelineUpdateInput {
  return {
    id,
    day,
    body: `Update ${id}`,
    category: null,
    primary: SELF,
    concerns: [],
    isWorld: true,
    resolvesArticleId: null,
    ...overrides,
  }
}

describe("buildTimelineDayViews", () => {
  it("groups consecutive same-day entries under one day heading", () => {
    const days = buildTimelineDayViews(
      [update("u1", 3), update("u2", 3), update("u3", 5)],
      HITS
    )
    expect(days.map((d) => d.day)).toEqual([3, 5])
    expect(days[0]!.entries.map((e) => e.id)).toEqual(["u1", "u2"])
  })

  it("marks primary vs concerned and elides the named entity", () => {
    const days = buildTimelineDayViews(
      [
        update("u1", 1, { concerns: [{ kind: "npc", id: "npc-2" }] }),
        update("u2", 1, {
          primary: { kind: "npc", id: "npc-2" },
          concerns: [SELF],
        }),
      ],
      HITS,
      { elide: SELF }
    )
    const [first, second] = days[0]!.entries
    expect(first!.isPrimary).toBe(true)
    expect(first!.others.map((o) => o.label)).toEqual(["Maren"])
    expect(second!.isPrimary).toBe(false)
    expect(second!.others.map((o) => o.label)).toEqual(["Maren"])
  })

  it("keeps world updates (null primary) and resolves tombstones muted", () => {
    const days = buildTimelineDayViews(
      [
        update("u1", 2, {
          primary: null,
          concerns: [SELF, { kind: "article", id: "art-1" }],
        }),
      ],
      HITS,
      { elide: SELF }
    )
    const entry = days[0]!.entries[0]!
    expect(entry.isPrimary).toBe(false)
    expect(entry.primary).toBeNull()
    expect(entry.others).toEqual([
      expect.objectContaining({ label: "The Old Keep", tombstoned: true }),
    ])
  })

  it("keeps the full participant strip when nothing is elided", () => {
    const days = buildTimelineDayViews(
      [
        update("u1", 4, {
          primary: { kind: "npc", id: "npc-2" },
          concerns: [{ kind: "article", id: "art-1" }],
        }),
      ],
      HITS
    )
    const entry = days[0]!.entries[0]!
    expect(entry.primary).toEqual(expect.objectContaining({ label: "Maren" }))
    expect(entry.isPrimary).toBe(false)
    expect(entry.others.map((o) => o.label)).toEqual(["Maren", "The Old Keep"])
    expect(entry.concerns.map((c) => c.label)).toEqual(["The Old Keep"])
  })

  it("resolves the ⚑ marker's anchor article", () => {
    const days = buildTimelineDayViews(
      [update("u1", 6, { resolvesArticleId: "art-2" })],
      HITS
    )
    expect(days[0]!.entries[0]!.resolves).toEqual(
      expect.objectContaining({ label: "Rise of the Demon Lord" })
    )
  })

  it("labels each day group with its inherit-forward season", () => {
    const days = buildTimelineDayViews(
      [update("u1", 2), update("u2", 9)],
      HITS,
      { seasons: [{ day: 5, label: "Late Thaw" }] }
    )
    expect(days.map((d) => d.seasonLabel)).toEqual([null, "Late Thaw"])
  })
})
