"use client"

import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

/**
 * The end-of-turn modal **shell** (UNN-344). End turn always opens it — a
 * deliberate end-of-turn beat, even when nothing needs resolving (product
 * decision in the AC). This ticket owns only the frame and the handoff: its
 * **Done** CTA closes the modal and drops the console into draft mode. The
 * obligation *rows* (saving throw / durations / concentrating) are UNN-317; until
 * then the body is a placeholder. Dismissing the dialog any other way (backdrop /
 * Escape) takes the same path as Done, so the DM can never get stranded.
 */
export function EndOfTurnModal({
  actorName,
  open,
  onDone,
}: {
  actorName: string
  open: boolean
  onDone: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-baseline justify-between gap-3">
          <DialogTitle>End of {actorName}&apos;s turn</DialogTitle>
          <span className="mr-6 text-sm text-muted-foreground">
            resolve, then draft
          </span>
        </DialogHeader>

        <p className="py-2 text-sm text-muted-foreground">
          End-of-turn checks — saving throws, condition durations, and
          Charged/Concentrating — resolve here in a later step.
        </p>

        <DialogFooter>
          <Button className="w-full" onClick={onDone}>
            <ArrowRightIcon weight="bold" />
            Done — open the draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
