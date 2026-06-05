"use client"

import { FlagCheckeredIcon } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

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

import { FALLEN_RECOVER_REMINDER } from "@/lib/ui/labels"

/**
 * The DM's "End encounter" control on the live console (UNN-320), behind an
 * `AlertDialog` since ending is terminal. Confirming flips the encounter to
 * `ended` (the page then re-forks to the read-only stub); combat state is
 * discarded with the session, so the dialog says so.
 *
 * When any PCs are Fallen it shows a **non-blocking reminder** that they recover
 * to 1 HP — the tracker never writes a character row, so each player sets it on
 * their own sheet (ADR *Cross-aggregate writes*). The list is display-only.
 */
export function EndCombatDialog({
  fallenPcNames,
  onConfirm,
  disabled,
}: {
  fallenPcNames: string[]
  onConfirm: () => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)

  function confirm() {
    onConfirm()
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <FlagCheckeredIcon weight="fill" />
        End encounter
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this encounter?</AlertDialogTitle>
            <AlertDialogDescription>
              Combat state — ailments and battle conditions — is discarded when
              the encounter ends. This can&apos;t be resumed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {fallenPcNames.length > 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm">
              <p className="text-muted-foreground">{FALLEN_RECOVER_REMINDER}</p>
              <p className="mt-1 font-medium">{fallenPcNames.join(", ")}</p>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={disabled}>
              End encounter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
