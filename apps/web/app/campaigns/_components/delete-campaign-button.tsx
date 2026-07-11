"use client"

import { TrashIcon } from "@phosphor-icons/react/dist/ssr"
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
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { CAMPAIGN_DELETE_LIVE_ENCOUNTER_ERROR } from "@/domain/labels"
import { deleteCampaignAction } from "@/lib/actions/delete-campaign"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * "Delete campaign" control on the DM manage page (UNN-330). Type-the-name
 * confirm (mirrors the delete-character dialog) since it's irreversible: deleting
 * the campaign cascade-removes its encounters + roster and unplaces every placed
 * character. Blocked with a toast while a `live` encounter is running; on success
 * the DM is routed to My Campaigns.
 */
export function DeleteCampaignButton({
  campaignId,
  campaignName,
}: {
  campaignId: string
  campaignName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [isPending, startTransition] = useTransition()
  const inputId = useId()

  const matches = typed.trim() === campaignName.trim()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setTyped("")
  }

  function onDelete() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await deleteCampaignAction({
            campaignId,
            confirmationName: typed,
          })
          if (result.ok) {
            onOpenChange(false)
            toast.success(`${campaignName} deleted.`)
            router.push("/campaigns")
            return
          }
          if (result.error === "live-encounter-exists") {
            onOpenChange(false)
            toast.error(CAMPAIGN_DELETE_LIVE_ENCOUNTER_ERROR)
            return
          }
          toast.error("Couldn't delete the campaign. Try again.")
        },
        () => toast.error("Couldn't delete the campaign. Try again.")
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
        Delete campaign
      </Button>

      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {campaignName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the campaign, its encounters, and the
              roster. Placed characters survive but are unplaced. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>
              Type{" "}
              <span className="font-medium text-foreground">
                {campaignName}
              </span>{" "}
              to confirm
            </Label>
            <Input
              id={inputId}
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={isPending}
              aria-label={`Type ${campaignName} to confirm`}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={onDelete}
              disabled={!matches || isPending}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
