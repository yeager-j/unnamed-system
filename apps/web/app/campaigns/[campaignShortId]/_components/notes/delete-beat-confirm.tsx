"use client"

import { useTransition } from "react"
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

import { deleteBeatAction } from "@/lib/actions/campaign-notes/beat"

const DELETE_ERROR_COPY: Record<string, string> = {
  "scheduled-to-past":
    "This beat ran on a past day — history keeps its structure. Unscheduling or deleting it isn't allowed.",
  "beat-not-found": "This beat is gone — refresh the page.",
}

/**
 * The beat delete confirm — the notes-side sibling of the world rails'
 * `DeleteEntityConfirm`, shared by the tree row's ⋯ menu and the editor's
 * trash button. Beats aren't participants, so there are no references to
 * count; what it carries instead is the frozen-past refusal (D1), surfaced as
 * copy rather than a silent no-op. Mount-on-open like every planner dialog.
 */
export function DeleteBeatConfirm({
  campaignId,
  beatId,
  onOpenChange,
  onDeleted,
}: {
  campaignId: string
  beatId: string
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const [, startTransition] = useTransition()

  const remove = () =>
    startTransition(async () => {
      const result = await deleteBeatAction({ campaignId, beatId })
      if (!result.ok) {
        toast.error(DELETE_ERROR_COPY[result.error] ?? "Couldn't delete.")
        return
      }
      onDeleted?.()
    })

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this beat?</AlertDialogTitle>
          <AlertDialogDescription>
            The note and its prose are gone for good. Beats that already ran on
            a past day can&apos;t be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false)
              remove()
            }}
          >
            Delete beat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
