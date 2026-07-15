/**
 * Schedule-control shaping (UNN-576, §2's UX delta): the picker is
 * **day-picker → slot-picker** — a flat enumeration of every open slot
 * doesn't survive a 30-day horizon — so upcoming slots group by day, each
 * slot carrying its occupancy so the picker can disable and attribute it.
 * Each day's `label` reads through the month reframe (UNN-629) — "May 3"
 * under an active month, else raw "Day N".
 */

import { activePeriod, resolveDayLabel, type PeriodMarker } from "../period"

/** The picker's slice of an upcoming slot (the query's `UpcomingSlot` shape). */
export interface SchedulePickerSlotInput {
  id: string
  day: number
  ordinal: number
  label: string
  occupiedByBeat: { id: string; title: string } | null
  occupiedByDungeon: { name: string } | null
}

export interface SchedulePickerSlotView {
  id: string
  label: string
  /** The occupying beat's title or claiming dungeon's name; null for an open slot. */
  occupiedBy: string | null
}

export interface SchedulePickerDayView {
  day: number
  /** "May 3" under an active month, else "Day 15" — the picker's day heading. */
  label: string
  /** True when every slot on the day is occupied (the day row still opens). */
  full: boolean
  slots: SchedulePickerSlotView[]
}

/**
 * Groups upcoming slots by day, preserving `(day, ordinal)` input order.
 * `occupiedBy` falls back to "Untitled beat" so the disabled slot always
 * names its holder.
 */
export function buildSchedulePickerDays(
  slots: readonly SchedulePickerSlotInput[],
  months: readonly PeriodMarker[] = []
): SchedulePickerDayView[] {
  const days = new Map<number, SchedulePickerSlotView[]>()
  for (const slot of slots) {
    const views = days.get(slot.day) ?? []
    views.push({
      id: slot.id,
      label: slot.label,
      occupiedBy:
        slot.occupiedByBeat !== null
          ? slot.occupiedByBeat.title.trim() === ""
            ? "Untitled beat"
            : slot.occupiedByBeat.title
          : (slot.occupiedByDungeon?.name ?? null),
    })
    days.set(slot.day, views)
  }
  return [...days.entries()].map(([day, dayViews]) => ({
    day,
    label: resolveDayLabel(day, activePeriod(months, day)),
    full: dayViews.every((slot) => slot.occupiedBy !== null),
    slots: dayViews,
  }))
}
