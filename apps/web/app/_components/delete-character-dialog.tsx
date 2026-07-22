"use client"

import { useRouter } from "next/navigation"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { CHARACTER_DELETE_LIVE_LOCK_ERROR } from "@/domain/labels"
import { deleteEntityAction } from "@/lib/actions/entity/delete"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"

interface DeleteCharacterDialogProps {
  characterId: string
  /**
   * The character's actual `name` column. Empty/whitespace flips the
   * dialog into the lightweight "Discard this draft?" confirm (UNN-219 /
   * ADR-002 §5.5); non-empty keeps the existing type-the-name flow.
   */
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Owner-only confirm modal for the one genuinely destructive action.
 *
 * Two-tier by `name` presence (UNN-219):
 *
 * - **Unnamed draft** (`name.trim()` is empty): single "Discard" affordance,
 *   same energy as dismissing an unsent email. Skips the type-to-confirm
 *   because the row has no identity worth protecting yet.
 * - **Named row** (every finalized character, plus any draft the player
 *   has typed a name into): the existing type-to-confirm gate. The
 *   destructive button enables only when the typed value (trimmed) matches
 *   the row's name; the Server Action re-checks the same comparison.
 *
 * Esc, the Cancel button, and clicking the backdrop all close the dialog
 * without side effects in either flow.
 */
export function DeleteCharacterDialog({
  characterId,
  name,
  open,
  onOpenChange,
}: DeleteCharacterDialogProps) {
  const isUnnamed = name.trim().length === 0

  if (isUnnamed) {
    return (
      <DiscardDraftDialog
        characterId={characterId}
        open={open}
        onOpenChange={onOpenChange}
      />
    )
  }

  return (
    <TypeToConfirmDialog
      characterId={characterId}
      name={name}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

function DiscardDraftDialog({
  characterId,
  open,
  onOpenChange,
}: {
  characterId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await deleteEntityAction({ entityId: characterId })

          if (result.ok) {
            toast.success("Draft discarded.")
            onOpenChange(false)
            router.refresh()
            return
          }

          toast.error("Couldn't discard. Try again.")
        },
        () => toast.error("Couldn't discard. Try again.")
      )
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            Your progress will be lost. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function TypeToConfirmDialog({
  characterId,
  name,
  open,
  onOpenChange,
}: {
  characterId: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [typed, setTyped] = useState("")
  const [pending, startTransition] = useTransition()
  const inputId = useId()

  function handleOpenChange(next: boolean) {
    if (!next) setTyped("")
    onOpenChange(next)
  }

  const matches = typed.trim() === name

  function handleConfirm() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await deleteEntityAction({
            entityId: characterId,
            confirmationName: typed,
          })

          if (result.ok) {
            toast.success(`${name} deleted.`)
            handleOpenChange(false)
            router.refresh()
            return
          }

          if (result.error === "live-encounter-lock") {
            toast.error(CHARACTER_DELETE_LIVE_LOCK_ERROR)
            handleOpenChange(false)
            return
          }

          toast.error("Couldn't delete. Try again.")
        },
        () => toast.error("Couldn't delete. Try again.")
      )
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes {name}, every archetype, knife, chain,
            talent, and inventory item on the sheet, and the public link. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>
            Type <span className="font-medium text-foreground">{name}</span> to
            confirm
          </Label>
          <Input
            id={inputId}
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={pending}
            aria-label={`Type ${name} to confirm`}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={!matches || pending}
          >
            Delete forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
