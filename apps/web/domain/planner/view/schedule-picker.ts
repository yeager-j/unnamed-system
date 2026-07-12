/**
 * Schedule-control shaping (UNN-576, §2's UX delta): the picker is
 * **day-picker → slot-picker** — a flat enumeration of every open slot
 * doesn't survive a 30-day horizon — so upcoming slots group by day, each
 * slot carrying its occupancy so the picker can disable and attribute it.
 */

/** The picker's slice of an upcoming slot (the query's `UpcomingSlot` shape). */
export interface SchedulePickerSlotInput {
  id: string
  day: number
  ordinal: number
  label: string
  occupiedByBeat: { id: string; title: string } | null
}

export interface SchedulePickerSlotView {
  id: string
  label: string
  /** The occupying beat's display title, or null for an open slot. */
  occupiedBy: string | null
}

export interface SchedulePickerDayView {
  day: number
  /** "Day 15" — the picker row; "Today" affordances are the component's call. */
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
  slots: readonly SchedulePickerSlotInput[]
): SchedulePickerDayView[] {
  const days = new Map<number, SchedulePickerSlotView[]>()
  for (const slot of slots) {
    const views = days.get(slot.day) ?? []
    views.push({
      id: slot.id,
      label: slot.label,
      occupiedBy:
        slot.occupiedByBeat === null
          ? null
          : slot.occupiedByBeat.title.trim() === ""
            ? "Untitled beat"
            : slot.occupiedByBeat.title,
    })
    days.set(slot.day, views)
  }
  return [...days.entries()].map(([day, dayViews]) => ({
    day,
    label: `Day ${day}`,
    full: dayViews.every((slot) => slot.occupiedBy !== null),
    slots: dayViews,
  }))
}
