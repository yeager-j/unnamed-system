import type { SlotTemplateEntry } from "@/lib/db/schema/campaign-clock"

/** A slot row to insert, planned by {@link planSlotMaterialization}. */
export type PlannedSlotRow = { day: number; ordinal: number; label: string }

/**
 * The integer days in the half-open interval `(fromExclusive, toInclusive]` —
 * the shape of every materialization window (D1): advance/time-skip covers
 * `(oldDay, newDay]`, add-days covers `(horizon, horizon + n]`.
 */
export function daysInInterval(
  fromExclusive: number,
  toInclusive: number
): number[] {
  const days: number[] = []
  for (let day = fromExclusive + 1; day <= toInclusive; day++) days.push(day)
  return days
}

/**
 * Plans the slot rows the default-slots template materializes for the given
 * days (D1's materialization rule): every listed day **without existing
 * slots** gets one row per template entry, ordinals in template order. Days
 * already holding slots are left untouched — the template applies
 * forward-only, so re-entering a day never rewrites it.
 *
 * Pure planning only; the caller inserts the rows inside its guarded
 * transaction.
 */
export function planSlotMaterialization(
  template: readonly SlotTemplateEntry[],
  days: readonly number[],
  daysWithSlots: ReadonlySet<number>
): PlannedSlotRow[] {
  return days
    .filter((day) => !daysWithSlots.has(day))
    .flatMap((day) =>
      template.map((entry, ordinal) => ({ day, ordinal, label: entry.label }))
    )
}
