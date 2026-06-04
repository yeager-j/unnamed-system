"use client"

import { SignOutIcon } from "@phosphor-icons/react/dist/ssr"
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

import { setCharacterCampaignAction } from "@/lib/actions/set-character-campaign"
import { CHARACTER_UNPLACE_CONSENT } from "@/lib/ui/labels"

/**
 * The per-card "remove from campaign" control on the placement section (UNN-328).
 * Unplaces the character (`campaignId → null`) behind an `AlertDialog` that
 * states the reverse consent — the DM loses HP/SP access. A `live-encounter-lock`
 * refusal (the character is a live combatant) surfaces as a toast.
 */
export function RemovePlacementButton({
  characterId,
  characterName,
}: {
  characterId: string
  characterName: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onConfirm() {
    startTransition(async () => {
      const result = await setCharacterCampaignAction({
        characterId,
        campaignId: null,
      })
      setOpen(false)
      if (result.ok) {
        toast.success(`${characterName} removed from the campaign.`)
        return
      }
      if (result.error === "live-encounter-lock") {
        toast.error(
          "Character is in an active encounter — it cannot be moved until the encounter ends."
        )
        return
      }
      toast.error("Couldn't remove the character. Try again.")
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${characterName} from campaign`}
        onClick={() => setOpen(true)}
      >
        <SignOutIcon />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {characterName} from this campaign?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {CHARACTER_UNPLACE_CONSENT}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} disabled={isPending}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
