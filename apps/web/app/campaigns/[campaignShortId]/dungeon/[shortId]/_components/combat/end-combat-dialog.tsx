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

import { FallenRecoverReminder } from "@/components/combat/dialogs/fallen-recover-reminder"

/**
 * The DM's "End encounter" control for a fight running **on the dungeon**
 * (UNN-536) — the delve peer of the mapless
 * {@link import("@/components/combat/dialogs/end-combat").EndCombatDialog}. It
 * carries the same terminal-and-discards warning + the Fallen-recover reminder,
 * and adds the **mark-the-turn** line: the fight consumed a dungeon turn, so
 * confirming both ends combat (pruning the Instance) **and** advances the delve
 * clock — one tap, committed atomically by
 * {@link import("@/lib/actions/dungeon/end-combat").endDungeonCombatAction}.
 */
export function DungeonEndCombatDialog({
  turnCounter,
  fallenPcNames,
  onConfirm,
  disabled,
}: {
  /** The dungeon turn this fight is consuming; the confirm advances to `+1`. */
  turnCounter: number
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

          <div className="rounded-md border border-dashed p-3 text-sm">
            <p className="text-muted-foreground">
              This fight consumed dungeon turn{" "}
              <span className="font-medium tabular-nums">{turnCounter}</span> —
              the delve will advance to turn{" "}
              <span className="font-medium tabular-nums">
                {turnCounter + 1}
              </span>
              .
            </p>
          </div>

          <FallenRecoverReminder names={fallenPcNames} />

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
