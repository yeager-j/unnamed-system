/**
 * Clock-time selectors (Campaign Planner tech-design §0/§4): every status here
 * is a pure selector over minimal stored facts — slot rows and the clock's
 * `currentDay` — never a second stored fact.
 */

/**
 * The campaign's **horizon** — the furthest materialized day, derived as
 * `max(day)` over slot rows (D1: never a stored integer). `null` means no
 * slots exist, which only happens before the clock is started.
 */
export function horizonOf(slots: readonly { day: number }[]): number | null {
  if (slots.length === 0) return null
  return slots.reduce((max, slot) => Math.max(max, slot.day), 0)
}

/**
 * Whether a day is **frozen** (D1: the clock bounds slot-attached writes).
 * Past days are history: schedule/unschedule/delete writes touching a slot on
 * a frozen day are rejected, so present-tense prep edits can never
 * retro-suppress or resurface recorded downtime.
 */
export function isFrozenDay(day: number, currentDay: number): boolean {
  return day < currentDay
}
