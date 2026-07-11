"use client"

import { XIcon } from "@phosphor-icons/react/dist/ssr"
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

import { MEMBER_REMOVE_LIVE_LOCK_ERROR } from "@/domain/labels"
import { removeCampaignMemberAction } from "@/lib/actions/remove-campaign-member"

/**
 * Removes a player from the roster on the campaign manage page (UNN-329). Behind
 * an `AlertDialog` confirm because it unplaces the player's characters (the
 * UNN-330 cascade); revalidation re-renders the roster on success.
 */
export function RemovePlayerButton({
  campaignId,
  userId,
  playerName,
}: {
  campaignId: string
  userId: string
  playerName: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onRemove() {
    startTransition(async () => {
      const result = await removeCampaignMemberAction({ campaignId, userId })
      setOpen(false)
      if (!result.ok) {
        toast.error(
          result.error === "live-encounter-lock"
            ? MEMBER_REMOVE_LIVE_LOCK_ERROR
            : "Couldn't remove the player. Try again."
        )
        return
      }
      toast.success(`Removed ${playerName} from the campaign.`)
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${playerName}`}
        onClick={() => setOpen(true)}
      >
        <XIcon weight="bold" />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {playerName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be removed from the campaign and any characters they
              placed here will be unplaced. They can rejoin with the invite
              link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove} disabled={isPending}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
