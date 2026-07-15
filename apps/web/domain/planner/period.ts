/**
 * A campaign **period**: a sparse `(campaignId, kind, day) → label` marker that
 * inherits forward (D1, FR-8). Two flavors share the whole spine — storage,
 * this selector, the writes, the actions, and the edit control:
 *
 * - **season** — pure flavor ("Late Thaw"), no day-number reframe.
 * - **month** — flavor *plus* it reframes how a day reads ({@link monthDate}):
 *   under an active month starting on day `S`, day `D` reads `"{month} D−S+1"`.
 *
 * Not a calendar engine — no fixed lengths, no years, no wrapping. A period
 * simply runs until the next marker of its kind takes over.
 */

/** The two period flavors backing one `(campaignId, kind, day)` table. */
export type PeriodKind = "season" | "month"

/** The period kinds, in display order — the CHECK + `PERIOD_KIND_LABEL` mirror. */
export const PERIOD_KINDS = ["season", "month"] as const

/** A period marker's shape as these selectors need it (structural — `CampaignPeriodRow` satisfies it). */
export type PeriodMarker = { day: number; label: string }

/**
 * The marker in effect on `day`: sparse markers **inherit forward** — the
 * latest marker at or before the day wins; `null` before the first marker.
 * The start day it carries is what {@link monthDate} counts a month's ordinal
 * from.
 */
export function activePeriod(
  markers: readonly PeriodMarker[],
  day: number
): PeriodMarker | null {
  let current: PeriodMarker | null = null
  for (const marker of markers) {
    if (marker.day > day) continue
    if (current === null || marker.day > current.day) current = marker
  }
  return current
}

/** The inherit-forward period label on `day`, or `null` before the first marker. */
export function periodOf(
  markers: readonly PeriodMarker[],
  day: number
): string | null {
  return activePeriod(markers, day)?.label ?? null
}

/**
 * The **month reframe** — the one place month diverges from season. Under an
 * active month starting on day `S`, day `D` reads `"{month} D−S+1"` (the start
 * day is `"{month} 1"`); `null` when no month is active (the caller falls back
 * to raw "Day N"). A deliberate month-specific special-case, not a per-kind
 * role — there is exactly one framing kind (see the ticket's design note).
 */
export function monthDate(
  day: number,
  activeMonth: PeriodMarker | null
): string | null {
  if (activeMonth === null) return null
  return `${activeMonth.label} ${day - activeMonth.day + 1}`
}

/**
 * A day's in-fiction label: the {@link monthDate} under an active month, else
 * the raw absolute "Day N". The one resolver every surface reads so "May 3"
 * and its "Day N" fallback never drift.
 */
export function resolveDayLabel(
  day: number,
  activeMonth: PeriodMarker | null
): string {
  return monthDate(day, activeMonth) ?? `Day ${day}`
}

/**
 * Partitions the campaign's period rows (both kinds, as `loadPeriods` returns
 * them) into one list per kind, preserving input order — the loaders' one call
 * between "read all periods" and "hand the calendar/timeline both tracks".
 */
export function groupPeriodsByKind<T extends { kind: PeriodKind }>(
  rows: readonly T[]
): Record<PeriodKind, T[]> {
  const grouped: Record<PeriodKind, T[]> = { season: [], month: [] }
  for (const row of rows) grouped[row.kind].push(row)
  return grouped
}
