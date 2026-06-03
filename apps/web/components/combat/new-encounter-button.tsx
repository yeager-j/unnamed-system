"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { createEncounterAction } from "@/lib/actions/encounter/create"

/**
 * The "New encounter" trigger on the thin `/campaigns` entry (UNN-335). Creates
 * a `draft` encounter in the given campaign and routes to its setup shell
 * (`/combat/{shortId}`) — mirroring {@link CreateCharacterButton}'s
 * action-then-redirect shape. The full campaign manage page (UNN-329) replaces
 * this surface; the button itself stays roughly as-is.
 */
export function NewEncounterButton({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await createEncounterAction({
        campaignId,
        name: "New encounter",
      })
      if (!result.ok) {
        toast.error("Couldn't create an encounter. Try again.")
        return
      }
      router.push(`/combat/${result.value.shortId}`)
    })
  }

  return (
    <Button onClick={onClick} disabled={isPending} size="sm">
      {isPending ? <Spinner /> : <PlusIcon weight="bold" />}
      New encounter
    </Button>
  )
}
