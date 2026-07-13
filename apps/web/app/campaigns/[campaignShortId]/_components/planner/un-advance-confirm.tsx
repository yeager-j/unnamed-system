"use client"

import { FlagIcon } from "@phosphor-icons/react/dist/ssr"

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

/** A ⚑ marker the un-advance would unbind (stamped on the current day). */
export interface UnAdvanceUnbind {
  articleId: string
  name: string
}

/**
 * The un-advance confirm, finalized (UNN-580 work item 5): enumerates
 * exactly what unbinds — the current day's ⚑ markers, by name (advisory;
 * the server's `day > newDay` unbind inside the transaction stays
 * authoritative) — and states what is **not** undone, so "scoped, one day,
 * nothing else" (D1/D5) is the DM's mental model, not a surprise.
 */
export function UnAdvanceConfirm({
  currentDay,
  unbinds,
  onOpenChange,
  onConfirm,
}: {
  currentDay: number
  unbinds: UnAdvanceUnbind[]
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Go back to Day {currentDay - 1}?</AlertDialogTitle>
          <AlertDialogDescription>
            Un-advance moves the day counter back one day.
            {unbinds.length === 0
              ? " No deadline resolutions unbind — nothing was resolved today."
              : ` ${unbinds.length === 1 ? "This deadline re-opens" : "These deadlines re-open"} (the ⚑ unbinds; each resolution note survives as a regular world update):`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {unbinds.length > 0 ? (
          <ul className="grid gap-1.5">
            {unbinds.map((unbind) => (
              <li
                key={unbind.articleId}
                className="flex items-center gap-2 text-sm font-medium"
              >
                <FlagIcon
                  weight="fill"
                  className="size-4 shrink-0 text-primary"
                />
                <span className="min-w-0 truncate">{unbind.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Nothing else is undone:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              beats resolved or deferred when the day ended stay that way
              (deferred ones wait on your prepped shelf)
            </li>
            <li>removed delve claims stay removed</li>
            <li>Idle marks from the day-end fill remain as editable entries</li>
            <li>
              world updates you logged keep their day — find and edit them in
              the Chronicle
            </li>
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            Go back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
