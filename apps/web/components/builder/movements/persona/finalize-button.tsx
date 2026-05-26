"use client"

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { finalizeCharacterAction } from "@/lib/actions/character-finalize"
import type { FinalizeCharacterError } from "@/lib/actions/character-finalize.schema"

/**
 * Movement 4's commit button (ADR-002 §"Movement 4 — The Person"). Flips the
 * draft to `finalized` via the Server Action and routes to the editable
 * sheet at `/c/{shortId}` on success. The label is exactly "Finalize
 * character" per the ticket — not "Continue", not "Next", not "Create."
 *
 * Disabled until every gated movement passes (`canFinalize` comes from
 * `findStepGateFailures(character).length === 0` on the route page). When
 * disabled, the failure reason surfaces as a tooltip so the player can see
 * what's blocking them without having to navigate back.
 */
export function FinalizeButton({
  characterId,
  identityVersion,
  canFinalize,
  disabledReason,
}: {
  characterId: string
  identityVersion: number
  canFinalize: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const disabled = isPending || !canFinalize

  function onClick() {
    if (!canFinalize) return
    startTransition(async () => {
      const result = await finalizeCharacterAction({
        characterId,
        expectedVersion: identityVersion,
      })
      if (result.ok) {
        toast.success("Character finalized.")
        router.push(`/c/${result.value.shortId}`)
        return
      }
      surfaceError(result.error)
      // Re-run the server render so a stale draft (e.g. another tab cleared
      // a field between our render and click) picks up the latest gate
      // failures.
      router.refresh()
    })
  }

  const button = (
    <Button size="lg" onClick={onClick} disabled={disabled}>
      {isPending ? <Spinner /> : <CheckCircleIcon weight="fill" />}
      Finalize character
    </Button>
  )

  if (!disabledReason || canFinalize) return button

  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} />}>{button}</TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  )
}

function surfaceError(error: FinalizeCharacterError): void {
  if (typeof error === "object" && error.kind === "missing-requirement") {
    toast.error(error.reason)
    return
  }
  if (error === "stale") {
    toast.error("This draft is out of sync. Refresh and try again.")
    return
  }
  if (error === "no-starting-weapon-for-lineage") {
    toast.error(
      "This Origin Lineage has no starting weapon yet — pick a different Origin Archetype."
    )
    return
  }
  if (error === "no-origin-archetype") {
    toast.error("Pick an Origin Archetype before finalizing.")
    return
  }
  if (error === "character-not-found") {
    toast.error("This draft no longer exists. Refresh to see your characters.")
    return
  }
  toast.error("Couldn't finalize your character — try again.")
}
