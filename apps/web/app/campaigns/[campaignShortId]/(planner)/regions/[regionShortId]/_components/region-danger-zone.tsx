"use client"

import { ArchiveIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
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

import { guardWriteTransition } from "@/lib/actions/guard-write-transition"
import { archiveRegionAction } from "@/lib/actions/region/archive"
import { deleteRegionAction } from "@/lib/actions/region/delete"
import { regionErrorMessage } from "@/lib/actions/region/error-message"
import { campaignManagePath } from "@/lib/paths"

/**
 * The Region detail page's destructive controls (UNN-589). Two verbs, both DM-only:
 *
 * - **Archive** hides the Region from campaign surfaces while its history keeps
 *   resolving — the reversible, always-available exit (a running expedition finishes
 *   on its own lifecycle). Guarded on `version`; a `stale` result refreshes.
 * - **Delete** is the irreversible mistake-fix, offered **only** when the Region has
 *   never spawned an expedition (`dungeon.regionId`'s FK makes deletion impossible
 *   once one exists — {@link import("@/lib/actions/region/delete").deleteRegionAction}
 *   refuses too). On success the DM lands back on the campaign Manage page.
 *
 * Modeled on the Set editor's {@link import("@/app/stage/_components/delete-set-button").DeleteSetButton}.
 */
export function RegionDangerZone({
  campaignShortId,
  regionId,
  regionName,
  version,
  isArchived,
  hasExpeditions,
}: {
  campaignShortId: string
  regionId: string
  regionName: string
  version: number
  isArchived: boolean
  hasExpeditions: boolean
}) {
  const router = useRouter()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isArchiving, startArchive] = useTransition()
  const [isDeleting, startDelete] = useTransition()

  function onArchive() {
    startArchive(() =>
      guardWriteTransition(
        async () => {
          const result = await archiveRegionAction({
            regionId,
            expectedVersion: version,
          })
          if (result.ok) {
            setArchiveOpen(false)
            toast.success(`${regionName} archived.`)
            router.refresh()
            return
          }
          toast.error(regionErrorMessage(result.error))
          if (result.error === "stale") router.refresh()
        },
        () => toast.error("Couldn't archive the region. Try again.")
      )
    )
  }

  function onDelete() {
    startDelete(() =>
      guardWriteTransition(
        async () => {
          const result = await deleteRegionAction({ regionId })
          if (result.ok) {
            setDeleteOpen(false)
            toast.success(`${regionName} deleted.`)
            router.push(campaignManagePath(campaignShortId))
            return
          }
          toast.error(regionErrorMessage(result.error))
        },
        () => toast.error("Couldn't delete the region. Try again.")
      )
    )
  }

  return (
    <section className="flex flex-col gap-3 border border-destructive/40 p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Danger zone</h2>
      <div className="flex flex-wrap gap-2">
        {!isArchived ? (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setArchiveOpen(true)}
          >
            <ArchiveIcon />
            Archive region
          </Button>
        ) : null}

        {!hasExpeditions ? (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <TrashIcon />
            Delete region
          </Button>
        ) : null}
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {regionName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides the region from your campaign surfaces. Its expedition
              history stays, and any running expedition finishes on its own.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onArchive} disabled={isArchiving}>
              Archive region
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {regionName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the region entirely. It has no expeditions, so
              nothing else is affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={onDelete}
              disabled={isDeleting}
            >
              Delete region
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
