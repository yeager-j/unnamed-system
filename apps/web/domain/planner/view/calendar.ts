import { deadlineState, type DeadlineState } from "../deadline"
import { seasonOf, type SeasonMarker } from "../season"

/**
 * Calendar shaping (UNN-578, PRD FR-8, handoff Screen 4): the upcoming-only
 * agenda — a deadline ribbon spanning today→due with far deadlines clamped
 * at the window's edge, and one day card per materialized day from today to
 * the horizon (season inherit-forward, dated-article lines, slot occupancy).
 * Pure; the page loads slots/seasons/dated articles/markers and the
 * components render what's here.
 */

/** The ribbon's tick window — the mock's 8-day grid; far deadlines clamp at its edge. */
export const RIBBON_TICKS = 8

/** The calendar's slice of a dated article (the loader's row shape suffices). */
export interface CalendarDatedArticleInput {
  id: string
  name: string
  datedDay: number | null
  datedKind: "event" | "deadline" | null
}

export interface CalendarRibbonBar {
  articleId: string
  name: string
  dueDay: number
  /** Grid columns the bar spans from today, 1..RIBBON_TICKS. */
  span: number
  /** Due beyond the tick window — the bar runs the full width and the label points off-grid. */
  clamped: boolean
  /** "3d → Day 17" · "→ Day 74" (clamped) · "due today" · "overdue". */
  countdownLabel: string
}

export interface CalendarRibbonView {
  /** The window's tick days: `[currentDay … currentDay + RIBBON_TICKS - 1]`. */
  tickDays: number[]
  /** Unresolved deadlines only, due-day ascending — events and resolved never enter. */
  bars: CalendarRibbonBar[]
}

export type CalendarDatedLine =
  | {
      kind: "deadline"
      articleId: string
      name: string
      state: DeadlineState
      /** The anchor's own `datedDay` — before the card's day for a carried overdue line. */
      dueDay: number
    }
  | { kind: "event"; articleId: string; name: string }

export type CalendarSlotContent =
  | { kind: "story"; beatTitle: string }
  | { kind: "dungeon"; dungeonName: string }
  | { kind: "open" }

export interface CalendarSlotView {
  id: string
  label: string
  content: CalendarSlotContent
}

export interface CalendarDayView {
  day: number
  isToday: boolean
  /** Inherit-forward season label (`seasonOf`); null before the first marker. */
  seasonLabel: string | null
  /** A season marker sits exactly on this day — the clear affordance's anchor. */
  seasonStartsHere: boolean
  /**
   * Every article dated to this day (several are legal), deadlines first.
   * Today's card also carries **unresolved overdue deadlines** (D5: overdue
   * ≡ due) — their own day renders no card on the upcoming-only agenda, and
   * a due deadline must keep its Resolve/re-date affordances reachable.
   */
  dated: CalendarDatedLine[]
  slots: CalendarSlotView[]
}

export interface CalendarView {
  currentDay: number
  /** The header now-pill's season half. */
  nowSeasonLabel: string | null
  ribbon: CalendarRibbonView
  /** Upcoming-only: one card per materialized day, today → horizon. */
  days: CalendarDayView[]
}

/** The builder's slice of an upcoming slot (the query's `UpcomingSlot` shape). */
export interface CalendarSlotInput {
  id: string
  day: number
  ordinal: number
  label: string
  occupiedByBeat: { id: string; title: string } | null
  occupiedByDungeon: { name: string } | null
}

export function buildCalendarView(input: {
  currentDay: number
  slots: readonly CalendarSlotInput[]
  seasons: readonly SeasonMarker[]
  datedArticles: readonly CalendarDatedArticleInput[]
  resolvedArticleIds: ReadonlySet<string>
}): CalendarView {
  const dated = input.datedArticles.filter(
    (article): article is CalendarDatedArticleInput & { datedDay: number } =>
      article.datedDay !== null && article.datedKind !== null
  )

  return {
    currentDay: input.currentDay,
    nowSeasonLabel: seasonOf(input.seasons, input.currentDay),
    ribbon: buildRibbon(input.currentDay, dated, input.resolvedArticleIds),
    days: buildDays(
      input.currentDay,
      input.slots,
      input.seasons,
      dated,
      input.resolvedArticleIds
    ),
  }
}

function buildRibbon(
  currentDay: number,
  dated: readonly (CalendarDatedArticleInput & { datedDay: number })[],
  resolvedArticleIds: ReadonlySet<string>
): CalendarRibbonView {
  const windowEnd = currentDay + RIBBON_TICKS - 1
  const bars = dated
    .filter(
      (article) =>
        article.datedKind === "deadline" && !resolvedArticleIds.has(article.id)
    )
    .sort((a, b) => a.datedDay - b.datedDay)
    .map((article): CalendarRibbonBar => {
      const dueDay = article.datedDay
      const clamped = dueDay > windowEnd
      const clampedEnd = Math.min(Math.max(dueDay, currentDay), windowEnd)
      return {
        articleId: article.id,
        name: article.name,
        dueDay,
        span: clampedEnd - currentDay + 1,
        clamped,
        countdownLabel: countdownLabel(currentDay, dueDay, clamped),
      }
    })
  return {
    tickDays: Array.from({ length: RIBBON_TICKS }, (_, i) => currentDay + i),
    bars,
  }
}

function countdownLabel(
  currentDay: number,
  dueDay: number,
  clamped: boolean
): string {
  if (clamped) return `→ Day ${dueDay}`
  if (dueDay < currentDay) return "overdue"
  if (dueDay === currentDay) return "due today"
  return `${dueDay - currentDay}d → Day ${dueDay}`
}

function buildDays(
  currentDay: number,
  slots: readonly CalendarSlotInput[],
  seasons: readonly SeasonMarker[],
  dated: readonly (CalendarDatedArticleInput & { datedDay: number })[],
  resolvedArticleIds: ReadonlySet<string>
): CalendarDayView[] {
  const slotsByDay = new Map<number, CalendarSlotView[]>()
  for (const slot of slots) {
    if (slot.day < currentDay) continue
    const views = slotsByDay.get(slot.day) ?? []
    views.push({
      id: slot.id,
      label: slot.label,
      content:
        slot.occupiedByBeat !== null
          ? {
              kind: "story",
              beatTitle:
                slot.occupiedByBeat.title.trim() === ""
                  ? "Untitled beat"
                  : slot.occupiedByBeat.title,
            }
          : slot.occupiedByDungeon !== null
            ? { kind: "dungeon", dungeonName: slot.occupiedByDungeon.name }
            : { kind: "open" },
    })
    slotsByDay.set(slot.day, views)
  }

  const markerDays = new Set(seasons.map((season) => season.day))

  return [...slotsByDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, daySlots]) => ({
      day,
      isToday: day === currentDay,
      seasonLabel: seasonOf(seasons, day),
      seasonStartsHere: markerDays.has(day),
      dated: dated
        .filter((article) =>
          article.datedDay === day
            ? true
            : // Carry unresolved overdue deadlines onto today (D5: overdue ≡
              // due) — their own day has no card, and a due deadline must
              // keep its Resolve/re-date affordances reachable.
              day === currentDay &&
              article.datedKind === "deadline" &&
              article.datedDay < currentDay &&
              !resolvedArticleIds.has(article.id)
        )
        .sort((a, b) =>
          a.datedKind === b.datedKind
            ? a.datedDay - b.datedDay
            : a.datedKind === "deadline"
              ? -1
              : 1
        )
        .map(
          (article): CalendarDatedLine =>
            article.datedKind === "deadline"
              ? {
                  kind: "deadline",
                  articleId: article.id,
                  name: article.name,
                  state: deadlineState(
                    { id: article.id, datedDay: article.datedDay },
                    currentDay,
                    resolvedArticleIds
                  ),
                  dueDay: article.datedDay,
                }
              : { kind: "event", articleId: article.id, name: article.name }
        ),
      slots: daySlots,
    }))
}
