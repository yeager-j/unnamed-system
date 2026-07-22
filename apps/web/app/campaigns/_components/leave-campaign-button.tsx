"use client"

import { SignOutIcon } from "@phosphor-icons/react/dist/ssr"
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

import { LEAVE_CAMPAIGN_LIVE_LOCK_ERROR } from "@/domain/labels"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"
import { leaveCampaignAction } from "@/lib/actions/leave-campaign"

/**
 * "Leave campaign" control on the member overview (UNN-330). Removes the viewer's
 * own membership and unplaces their characters; behind an `AlertDialog` since it
 * unplaces. A `live-encounter-lock` (one of their characters is mid-fight)
 * surfaces as a toast; on success the viewer is routed back to My Campaigns.
 */
export function LeaveCampaignButton({
  campaignId,
  campaignName,
}: {
  campaignId: string
  campaignName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onLeave() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await leaveCampaignAction({ campaignId })
          if (result.ok) {
            setOpen(false)
            toast.success(`You left ${campaignName}.`)
            router.push("/campaigns")
            return
          }
          setOpen(false)
          if (result.error === "live-encounter-lock") {
            toast.error(LEAVE_CAMPAIGN_LIVE_LOCK_ERROR)
            return
          }
          toast.error("Couldn't leave the campaign. Try again.")
        },
        () => toast.error("Couldn't leave the campaign. Try again.")
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
        <SignOutIcon />
        Leave campaign
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {campaignName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll be removed from the campaign and any characters you
              placed here will be unplaced. You can rejoin with the invite link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onLeave} disabled={isPending}>
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
