import { toast } from "sonner"

/**
 * One error-copy map for every Day Runner write (clock, beats, claims,
 * day-end) — the runner's surfaces share a vocabulary, so a beat card and a
 * pull-in menu describing the same `"slot-occupied"` differently would read
 * as two different problems.
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
  "invalid-input": "Couldn't save — that input doesn't look right.",
}

export function runnerErrorToast(error: string) {
  toast.error(RUNNER_ERROR_COPY[error] ?? "Couldn't save that. Try again.")
}
