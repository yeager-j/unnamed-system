/**
 * Deadline-lifecycle selectors (Campaign Planner tech-design D1/D5, PRD FR-7):
 * Looming/Due/Resolved are pure selectors over `datedDay`, the clock's
 * `currentDay`, and ⚑-marker existence — never a stored status.
 */

/** A dated deadline's facts as these selectors need them (structural — a dated `CampaignArticleRow` satisfies it). */
export interface DatedDeadline {
  id: string
  name: string
  datedDay: number
}

export type DeadlineState = "looming" | "due" | "resolved"

/**
 * A deadline's lifecycle state: resolved ⇔ a ⚑ marker binds it; otherwise
 * Due once `datedDay ≤ currentDay` — **overdue is not a fourth state** (D5:
 * a deadline re-opened after its day renders as Due at zero days); Looming
 * before that.
 */
export function deadlineState(
  deadline: { id: string; datedDay: number },
  currentDay: number,
  resolvedArticleIds: ReadonlySet<string>
): DeadlineState {
  if (resolvedArticleIds.has(deadline.id)) return "resolved"
  return deadline.datedDay <= currentDay ? "due" : "looming"
}

/**
 * D1's advance gate: the unresolved deadlines with `datedDay <= newDay`, any
 * of which blocks advancing/skipping to `newDay`. The bound is deliberately
 * **≤, not <** — the world may never stand on an unresolved deadline's day,
 * so resolution happens at or before the day-end crossing into it (PRD FR-6's
 * "LOOMING DEADLINE" alert fires at that boundary). It also covers the whole
 * past, not merely the skipped interval: an overdue-unresolved deadline
 * (re-opened via unbind or re-dated) blocks the *next* advance.
 */
export function blockingDeadlines(
  deadlines: readonly DatedDeadline[],
  newDay: number,
  resolvedArticleIds: ReadonlySet<string>
): DatedDeadline[] {
  return deadlines.filter(
    (deadline) =>
      !resolvedArticleIds.has(deadline.id) && deadline.datedDay <= newDay
  )
}
