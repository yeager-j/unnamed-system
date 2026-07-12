import { describe, expect, it } from "vitest"

import { buildCalendarView, RIBBON_TICKS } from "./calendar"

const none: ReadonlySet<string> = new Set()

function slot(
  id: string,
  day: number,
  ordinal: number,
  occupancy?: {
    beat?: { id: string; title: string }
    dungeon?: { name: string }
  }
) {
  return {
    id,
    day,
    ordinal,
    label: ordinal === 0 ? "Morning" : "Evening",
    occupiedByBeat: occupancy?.beat ?? null,
    occupiedByDungeon: occupancy?.dungeon ?? null,
  }
}

function deadline(id: string, name: string, day: number) {
  return { id, name, datedDay: day, datedKind: "deadline" as const }
}

function event(id: string, name: string, day: number) {
  return { id, name, datedDay: day, datedKind: "event" as const }
}

const TWO_DAYS = [slot("s1", 14, 0), slot("s2", 14, 1), slot("s3", 15, 0)]

describe("buildCalendarView — ribbon", () => {
  it("spans a bar from today to its due day", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: TWO_DAYS,
      seasons: [],
      datedArticles: [deadline("demon", "Rise of the Demon Lord", 17)],
      resolvedArticleIds: none,
    })

    expect(view.ribbon.tickDays).toEqual([14, 15, 16, 17, 18, 19, 20, 21])
    expect(view.ribbon.bars).toEqual([
      {
        articleId: "demon",
        name: "Rise of the Demon Lord",
        dueDay: 17,
        span: 4,
        clamped: false,
        countdownLabel: "3d → Day 17",
      },
    ])
  })

  it("keeps a bar due on the window's last tick unclamped, and clamps one past it", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: TWO_DAYS,
      seasons: [],
      datedArticles: [
        deadline("edge", "Edge", 14 + RIBBON_TICKS - 1),
        deadline("far", "Far", 74),
      ],
      resolvedArticleIds: none,
    })

    const [edge, far] = view.ribbon.bars
    expect(edge).toMatchObject({ span: RIBBON_TICKS, clamped: false })
    expect(far).toMatchObject({
      span: RIBBON_TICKS,
      clamped: true,
      countdownLabel: "→ Day 74",
    })
  })

  it("renders concurrent deadlines due-day ascending", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: TWO_DAYS,
      seasons: [],
      datedArticles: [
        deadline("siege", "Siege of Saltmere", 18),
        deadline("demon", "Rise of the Demon Lord", 17),
      ],
      resolvedArticleIds: none,
    })

    expect(view.ribbon.bars.map((bar) => bar.articleId)).toEqual([
      "demon",
      "siege",
    ])
  })

  it("renders due-today and overdue at span 1", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: TWO_DAYS,
      seasons: [],
      datedArticles: [
        deadline("today", "Today", 14),
        deadline("past", "Past", 12),
      ],
      resolvedArticleIds: none,
    })

    expect(view.ribbon.bars).toEqual([
      expect.objectContaining({
        articleId: "past",
        span: 1,
        countdownLabel: "overdue",
      }),
      expect.objectContaining({
        articleId: "today",
        span: 1,
        countdownLabel: "due today",
      }),
    ])
  })

  it("keeps events and resolved deadlines off the ribbon", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: TWO_DAYS,
      seasons: [],
      datedArticles: [
        event("festival", "Tidewake Festival", 14),
        deadline("done", "Done", 16),
      ],
      resolvedArticleIds: new Set(["done"]),
    })

    expect(view.ribbon.bars).toEqual([])
  })
})

describe("buildCalendarView — days", () => {
  it("is upcoming-only: past days never enter, days sort ascending", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: [slot("old", 13, 0), slot("s2", 15, 0), slot("s1", 14, 0)],
      seasons: [],
      datedArticles: [],
      resolvedArticleIds: none,
    })

    expect(view.days.map((day) => day.day)).toEqual([14, 15])
    expect(view.days[0]).toMatchObject({ isToday: true })
    expect(view.days[1]).toMatchObject({ isToday: false })
  })

  it("inherits seasons forward and marks where a marker sits", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: [slot("s1", 14, 0), slot("s2", 15, 0), slot("s3", 16, 0)],
      seasons: [
        { day: 5, label: "Late Thaw" },
        { day: 16, label: "High Summer" },
      ],
      datedArticles: [],
      resolvedArticleIds: none,
    })

    expect(
      view.days.map((day) => [day.seasonLabel, day.seasonStartsHere])
    ).toEqual([
      ["Late Thaw", false],
      ["Late Thaw", false],
      ["High Summer", true],
    ])
    expect(view.nowSeasonLabel).toBe("Late Thaw")
  })

  it("carries every dated line on its day, deadlines before events, with lifecycle state", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: [slot("s1", 14, 0), slot("s2", 16, 0)],
      seasons: [],
      datedArticles: [
        event("festival", "Tidewake Festival", 16),
        deadline("due", "Due Today", 14),
        deadline("resolved", "Handled", 16),
        deadline("looming", "Looming", 16),
      ],
      resolvedArticleIds: new Set(["resolved"]),
    })

    expect(view.days[0]!.dated).toEqual([
      { kind: "deadline", articleId: "due", name: "Due Today", state: "due" },
    ])
    expect(view.days[1]!.dated).toEqual([
      expect.objectContaining({ articleId: "resolved", state: "resolved" }),
      expect.objectContaining({ articleId: "looming", state: "looming" }),
      { kind: "event", articleId: "festival", name: "Tidewake Festival" },
    ])
  })

  it("forks slot content on occupancy with the untitled-beat fallback", () => {
    const view = buildCalendarView({
      currentDay: 14,
      slots: [
        slot("s1", 14, 0, { beat: { id: "b1", title: "  " } }),
        slot("s2", 14, 1, { dungeon: { name: "The Salt Mines" } }),
        slot("s3", 15, 0),
      ],
      seasons: [],
      datedArticles: [],
      resolvedArticleIds: none,
    })

    expect(view.days[0]!.slots.map((s) => s.content)).toEqual([
      { kind: "story", beatTitle: "Untitled beat" },
      { kind: "dungeon", dungeonName: "The Salt Mines" },
    ])
    expect(view.days[1]!.slots[0]!.content).toEqual({ kind: "open" })
  })
})
