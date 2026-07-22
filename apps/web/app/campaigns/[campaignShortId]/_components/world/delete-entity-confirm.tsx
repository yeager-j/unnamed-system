"use client"

import { useEffect, useState, useTransition } from "react"
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

import {
  refCountLine,
  type ParticipantRefCounts,
} from "@/domain/planner/view/world-detail"
import { deleteArticleAction } from "@/lib/actions/campaign-world/delete-article"
import { deleteNpcAction } from "@/lib/actions/campaign-world/delete-npc"
import { loadRefCountsAction } from "@/lib/actions/campaign-world/ref-counts"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"

/** What the confirm needs to know about its target. */
export interface DeleteEntityTarget {
  kind: "npc" | "article"
  id: string
  name: string
}

/**
 * The shared Article/NPC delete confirm (UNN-579 work item 5): fetches the
 * target's **real reference counts on open** (`loadRefCountsAction` — no
 * sidebar precompute) and renders them in the description, replacing
 * phase 2's hardcoded "Referenced nowhere yet." Mount-on-open like every
 * planner dialog. Used by both the tree rows and the detail pages.
 */
export function DeleteEntityConfirm({
  campaignId,
  target,
  onOpenChange,
  onDeleted,
}: {
  campaignId: string
  target: DeleteEntityTarget
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const [counts, setCounts] = useState<ParticipantRefCounts | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    loadRefCountsAction({
      campaignId,
      ref: { kind: target.kind, id: target.id },
    })
      .then((result) => {
        if (!cancelled && result.ok) setCounts(result.value)
      })
      // A detached chain can't surface framework signals (the guardWrite
      // corollary) — a failed count read just leaves "Counting references…".
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [campaignId, target.kind, target.id])

  const onDelete = () =>
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result =
            target.kind === "npc"
              ? await deleteNpcAction({ campaignId, entityId: target.id })
              : await deleteArticleAction({ campaignId, articleId: target.id })
          if (result.ok) {
            onOpenChange(false)
            toast.success(`${target.name} removed from the world.`)
            onDeleted?.()
            return
          }
          toast.error(`Couldn't delete ${target.name}. Try again.`)
        },
        () => toast.error(`Couldn't delete ${target.name}. Try again.`)
      )
    )

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {target.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {counts === null ? "Counting references…" : refCountLine(counts)}{" "}
            Its name lives on in past updates, but it leaves every list and
            linker
            {target.kind === "npc"
              ? ", and its Lineage returns to the deck"
              : ""}
            . Relations pointing at it are removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>
            Delete {target.kind === "npc" ? "NPC" : "article"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
