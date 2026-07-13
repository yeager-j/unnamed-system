"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"

import type { DayEndReadiness } from "@/domain/planner/day-end"
import type { EndDayMode } from "@/lib/db/writes/campaign-clock"

/** Sentence fragments for the warning's loose-ends line. */
function looseEndsLine(readiness: DayEndReadiness): string {
  const parts: string[] = []
  if (readiness.unresolvedStorySlots > 0) {
    parts.push(
      readiness.unresolvedStorySlots === 1
        ? "a story beat is unresolved"
        : `${readiness.unresolvedStorySlots} story beats are unresolved`
    )
  }
  if (readiness.unresolvedDungeonSlots > 0) {
    parts.push(
      readiness.unresolvedDungeonSlots === 1
        ? "a delve is unresolved"
        : `${readiness.unresolvedDungeonSlots} delves are unresolved`
    )
  }
  if (readiness.missingEntries > 0) {
    parts.push(
      readiness.missingEntries === 1
        ? "a downtime entry is missing"
        : `${readiness.missingEntries} downtime entries are missing`
    )
  }
  return parts.join(", ")
}

/**
 * The day-end warning (FR-5): the soft safety net over an unfinished day,
 * fired by the capture ritual's gilded finisher (UNN-580 — a *ready* day
 * advances straight from the finisher; the capture view is the confirm).
 * **Resolve All** = "it all happened, I just didn't tick"; **Defer
 * Unresolved** = "we didn't get to those scenes" (beats float to the shelf
 * with a return ticket, delves unclaim — re-claim tomorrow). Both fill every
 * missing downtime entry with a quiet Idle mark and advance. The app never
 * auto-defers — this dialog is the only place either bulk action fires.
 */
export function DayEndWarning({
  currentDay,
  readiness,
  onOpenChange,
  onEndWith,
}: {
  currentDay: number
  readiness: DayEndReadiness
  onOpenChange: (open: boolean) => void
  onEndWith: (mode: EndDayMode) => void
}) {
  const hasUnresolved =
    readiness.unresolvedStorySlots > 0 || readiness.unresolvedDungeonSlots > 0
  const end = (mode: EndDayMode) => {
    onOpenChange(false)
    onEndWith(mode)
  }
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            End Day {currentDay} with loose ends?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Right now {looseEndsLine(readiness)}.{" "}
            {hasUnresolved ? (
              <>
                <strong>Resolve All</strong> marks the beats and delves
                resolved; <strong>Defer Unresolved</strong> floats the beats to
                your prepped shelf and unclaims the delves (the dungeons stay in
                your library — claim them again tomorrow).{" "}
              </>
            ) : null}
            Characters still missing an entry get a quiet Idle mark either way,
            and the clock moves to Day {currentDay + 1}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {hasUnresolved ? (
            <Button variant="outline" onClick={() => end("defer-unresolved")}>
              Defer Unresolved
            </Button>
          ) : null}
          <AlertDialogAction onClick={() => end("resolve-all")}>
            Resolve All
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
