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

import { deleteCharacterAction } from "@/lib/actions/delete-character"

interface DeleteCharacterDialogProps {
  characterId: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Type-to-confirm modal for the one genuinely destructive owner action.
 * The destructive button only enables once the typed value (trimmed)
 * exactly matches the character's name; the Server Action re-checks the
 * same comparison server-side as defense-in-depth.
 *
 * Esc, the Cancel button, and clicking the backdrop all close the dialog
 * without side effects — Base UI's `AlertDialog.Root` wires those up.
 *
 * The action runs inside a `useTransition` so the destructive button can
 * disable while in flight; on success we `router.refresh()` so the
 * already-revalidated My Characters list re-renders without the deleted
 * row.
 */
export function DeleteCharacterDialog({
  characterId,
  name,
  open,
  onOpenChange,
}: DeleteCharacterDialogProps) {
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
    startTransition(async () => {
      const result = await deleteCharacterAction({
        characterId,
        confirmationName: typed,
      })

      if (result.ok) {
        toast.success(`${name} deleted.`)
        handleOpenChange(false)
        router.refresh()
        return
      }

      if (result.error === "character-not-found") {
        toast.error("Character already deleted.")
        handleOpenChange(false)
        router.refresh()
        return
      }

      toast.error("Couldn't delete. Try again.")
    })
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
