import { toast } from "sonner"

/**
 * One error-copy map for every planner write (clock, beats, claims, day-end,
 * dated articles) — the runner and Calendar share a vocabulary, so a beat
 * card and a day card describing the same `"slot-occupied"` differently
 * would read as two different problems.
 */
const RUNNER_ERROR_COPY: Record<string, string> = {
  stale:
    "The clock moved under you — probably another tab. Refresh to catch up.",
  "clock-not-found": "The clock is gone — refresh the page.",
  "at-floor": "Already at the earliest day the clock has seen.",
  "frozen-day": "That day is in the past — history stays put.",
  "day-not-materialized": "That day has no slots yet.",
  "slot-not-found": "That slot no longer exists — refresh the page.",
  "slot-occupied":
    "That slot is already spoken for — refresh to see what holds it.",
  "beat-not-found": "That beat is gone — refresh the page.",
  "not-scheduled": "That beat isn't scheduled here anymore — refresh the page.",
  "dungeon-not-found": "That dungeon is gone — refresh the page.",
  "claim-not-found": "That delve claim is gone — refresh the page.",
  "scheduled-to-past": "That beat is part of a past day — history stays put.",
  "not-ready":
    "The day picked up loose ends since this loaded — check the warning and choose how to close them out.",
  "deadline-due":
    "A deadline is due and unresolved — resolve it on the Calendar before time moves on.",
  "article-not-found": "That article is gone — refresh the page.",
  "placement-exists": "That event is already on this day.",
  "placement-not-found": "That event placement is gone — refresh the page.",
  "has-event-placements":
    "That article already appears as an event — use a separate article for the deadline.",
  "article-is-deadline":
    "That article is a deadline — deadlines and events can't share an article.",
  "article-resolved":
    "That deadline is already resolved — reopen it before changing its date.",
  "not-a-deadline": "Only deadline articles can be resolved.",
  "not-resolved": "That deadline isn't resolved — nothing to reopen.",
  "montage-character-invalid":
    "One of those characters isn't in this campaign anymore — refresh the page.",
  "invalid-input": "Couldn't save — that input doesn't look right.",
}

export function runnerErrorToast(error: string) {
  toast.error(RUNNER_ERROR_COPY[error] ?? "Couldn't save that. Try again.")
}
