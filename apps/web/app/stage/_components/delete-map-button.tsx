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

import { deleteMapAction } from "@/lib/actions/delete-map"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"
import { stageMapsPath } from "@/lib/paths"

/**
 * "Delete map" control on the editor (UNN-460). A simple confirm — Map deletion
 * is low-stakes (it's a template; the `mapInstance.mapId` FK is `set null`, so any
 * minted Instance survives), so no type-to-confirm. On success the owner is routed
 * to My Maps.
 */
export function DeleteMapButton({
  mapId,
  mapName,
}: {
  mapId: string
  mapName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onDelete() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await deleteMapAction({ mapId })
          if (result.ok) {
            setOpen(false)
            toast.success(`${mapName} deleted.`)
            router.push(stageMapsPath())
            return
          }
          toast.error(
            result.error === "map-in-use"
              ? "A Region seeds from this map — archive or delete that Region first."
              : "Couldn't delete the map. Try again."
          )
        },
        () => toast.error("Couldn't delete the map. Try again.")
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
        Delete map
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {mapName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the map template. Any dungeon already
              running on a copy of it keeps its own snapshot. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={onDelete}
              disabled={isPending}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
