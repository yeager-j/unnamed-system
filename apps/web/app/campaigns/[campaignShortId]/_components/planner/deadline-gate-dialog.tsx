"use client"

import { FlagBannerIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"

import type { DatedDeadline } from "@/domain/planner/deadline"
import { campaignCalendarPath } from "@/lib/paths"

/**
 * The hard gate's face (D1/D5, PRD FR-6): time cannot move at or past an
 * unresolved deadline's day. Deliberately no proceed button — the one
 * nudge-not-gate exception — and it stacks *above* the soft day-end warning:
 * a blocked day never reaches it. Resolve lives on the Calendar in phase 5;
 * the Day-End alert's inline Resolve arrives with the capture ritual
 * (phase 7). The server re-checks inside the advance transaction either way
 * — this dialog is the advisory face of that refusal.
 */
export function DeadlineGateDialog({
  blockers,
  campaignShortId,
  onOpenChange,
}: {
  blockers: DatedDeadline[]
  campaignShortId: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Time can&apos;t move past an unresolved deadline
          </AlertDialogTitle>
          <AlertDialogDescription>
            The world is holding its breath. Resolve{" "}
            {blockers.length === 1 ? "this" : "these"} on the Calendar —
            resolved is outcome-neutral, it only means the story answered it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="grid gap-1.5">
          {blockers.map((deadline) => (
            <li
              key={deadline.id}
              className="flex items-center gap-2 text-sm font-medium text-destructive"
            >
              <FlagBannerIcon weight="fill" className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{deadline.name}</span>
              <span className="ml-auto shrink-0 font-mono text-xs tabular-nums">
                due Day {deadline.datedDay}
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <Button
            render={<Link href={campaignCalendarPath(campaignShortId)} />}
            nativeButton={false}
          >
            Open the Calendar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
