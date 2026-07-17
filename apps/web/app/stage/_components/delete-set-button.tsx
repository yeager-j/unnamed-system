"use client"

import { TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
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
import { Button } from "@workspace/ui/components/button"

import { deleteTemplateSetAction } from "@/lib/actions/template-set/delete"
import { stageSetsPath } from "@/lib/paths"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * "Delete set" control on the Set editor (UNN-588). A simple confirm — the
 * delete is soft (`deletedAt`; the row survives for future Region references),
 * but the product treats it as gone, so the copy doesn't promise recovery. On
 * success the owner is routed to the Sets list.
 */
export function DeleteSetButton({
  templateSetId,
  setName,
}: {
  templateSetId: string
  setName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onDelete() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await deleteTemplateSetAction({ templateSetId })
          if (result.ok) {
            setOpen(false)
            toast.success(`${setName} deleted.`)
            router.push(stageSetsPath())
            return
          }
          toast.error("Couldn't delete the set. Try again.")
        },
        () => toast.error("Couldn't delete the set. Try again.")
      )
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="self-start text-destructive"
        onClick={() => setOpen(true)}
      >
        <TrashIcon />
        Delete set
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {setName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the set from your library. Regions already running on
              it keep resolving what they&apos;ve seen. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={onDelete}
              disabled={isPending}
            >
              Delete set
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
