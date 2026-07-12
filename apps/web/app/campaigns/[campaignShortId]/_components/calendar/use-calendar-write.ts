"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { runnerErrorToast } from "../planner/runner-errors"

/**
 * Errors that mean this tab's picture went stale — the write's target moved
 * or vanished under it — so a refresh re-renders the truth alongside the
 * toast.
 */
const REFRESH_ERRORS = new Set([
  "stale",
  "clock-not-found",
  "slot-not-found",
  "slot-occupied",
  "article-not-found",
  "article-resolved",
  "not-resolved",
])

/**
 * The Calendar's write plumbing — the runner's `run` pattern (UNN-577): ride
 * `useTransition` (controls never disable on pending), toast the shared
 * planner error copy, refresh on staleness so the next render tells the
 * truth. Successful writes need no refresh: their actions `revalidatePath`.
 */
export function useCalendarWrite() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const run = (
    write: () => Promise<{ ok: true } | { ok: false; error: string }>,
    after?: () => void
  ) =>
    startTransition(async () => {
      const result = await write()
      if (!result.ok) {
        runnerErrorToast(result.error)
        if (REFRESH_ERRORS.has(result.error)) router.refresh()
        return
      }
      after?.()
    })

  return { run, isPending }
}
