import { describe, expect, it } from "vitest"

import type { ChronicleUpdateRow } from "@/lib/db/queries/load-campaign-updates"

import type { ParticipantHitsByKind } from "../participant"
import {
  buildChronicleDayViews,
  isShownByDefaultInChronicle,
  mergeChroniclePages,
  parseChronicleParams,
} from "./chronicle"
import type { TimelineDayView, TimelineEntryView } from "./timeline"

const HITS: ParticipantHitsByKind = {
  npc: new Map([["npc-1", { name: "Maren", deletedAt: null }]]),
  article: new Map(),
  character: new Map(),
}

function row(
  id: string,
  day: number,
  authoredAt: string,
  overrides: Partial<ChronicleUpdateRow> = {}
): ChronicleUpdateRow {
  return {
    id,
    day,
    body: `Update ${id}`,
    category: null,
    primary: null,
    concerns: [],
    isWorld: true,
    resolvesArticleId: null,
    authoredAt: new Date(authoredAt),
    ...overrides,
  }
}

describe("isShownByDefaultInChronicle", () => {
  it("filters idle entries out by default", () => {
    expect(isShownByDefaultInChronicle({ category: "idle" })).toBe(false)
  })

  it("shows categorized downtime and uncategorized world updates", () => {
    expect(isShownByDefaultInChronicle({ category: "virtue" })).toBe(true)
    expect(isShownByDefaultInChronicle({ category: "collaborator" })).toBe(true)
    expect(isShownByDefaultInChronicle({ category: null })).toBe(true)
  })
})

describe("buildChronicleDayViews", () => {
  it("keeps days descending but flips entries ascending within a day", () => {
    const days = buildChronicleDayViews(
      [
        row("u3", 14, "2026-07-12T22:00:00Z"),
        row("u2", 14, "2026-07-12T09:00:00Z"),
        row("u1", 12, "2026-07-10T12:00:00Z"),
      ],
      HITS,
      [{ day: 10, label: "Late Thaw" }]
    )
    expect(days.map((d) => d.day)).toEqual([14, 12])
    expect(days[0]!.entries.map((e) => e.id)).toEqual(["u2", "u3"])
    expect(days[0]!.seasonLabel).toBe("Late Thaw")
  })
})

describe("mergeChroniclePages", () => {
  const entry = (id: string): TimelineEntryView => ({
    id,
    day: 0,
    body: "",
    category: null,
    isWorld: true,
    primary: null,
    isPrimary: false,
    others: [],
    concerns: [],
    resolves: null,
  })
  const group = (day: number, ...ids: string[]): TimelineDayView => ({
    day,
    seasonLabel: null,
    entries: ids.map(entry),
  })

  it("concatenates when the boundary does not split a day", () => {
    const merged = mergeChroniclePages([group(14, "a")], [group(12, "b")])
    expect(merged.map((d) => d.day)).toEqual([14, 12])
  })

  it("merges a split day, prepending the older page's earlier entries", () => {
    const merged = mergeChroniclePages(
      [group(14, "a"), group(12, "late1", "late2")],
      [group(12, "early1", "early2"), group(11, "c")]
    )
    expect(merged.map((d) => d.day)).toEqual([14, 12, 11])
    expect(merged[1]!.entries.map((e) => e.id)).toEqual([
      "early1",
      "early2",
      "late1",
      "late2",
    ])
  })

  it("handles an empty loaded feed", () => {
    const older = [group(3, "x")]
    expect(mergeChroniclePages([], older)).toEqual(older)
  })
})

describe("parseChronicleParams", () => {
  it("decodes the full param set", () => {
    expect(
      parseChronicleParams({
        about: "npc:npc-1",
        cat: "virtue",
        idle: "1",
        day: "14",
      })
    ).toEqual({
      filters: {
        participant: { kind: "npc", id: "npc-1" },
        category: "virtue",
        showIdle: true,
      },
      startDay: 14,
    })
  })

  it("treats malformed values as absent — a shared URL never breaks", () => {
    expect(
      parseChronicleParams({
        about: "dragon:x",
        cat: "heroics",
        idle: "yes",
        day: "-3",
      })
    ).toEqual({
      filters: { participant: null, category: null, showIdle: false },
      startDay: null,
    })
    expect(parseChronicleParams({})).toEqual({
      filters: { participant: null, category: null, showIdle: false },
      startDay: null,
    })
  })
})
