"use client"

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { finalizeCharacterAction } from "@/lib/actions/character-finalize"
import type { FinalizeCharacterError } from "@/lib/actions/character-finalize.schema"

/**
 * Client island for the "Create character" CTA. Flips the draft to
 * `finalized` via the Server Action and routes to the public sheet on
 * success. The button stays disabled while there are unresolved
 * `nextGateForStep` failures (mirrored client-side from the validation
 * summary above) — the server check is canonical, but disabling here
 * avoids a needless round-trip + toast for the obvious "you haven't
 * filled out X yet" case.
 *
 * Toast copy distinguishes the three meaningful failure shapes:
 *
 * - `missing-requirement` → "Fix in {step}" toast action that deep-links
 *   to the failing step. Catches a race where the failure appears between
 *   server render and submit (e.g. another tab cleared the field).
 * - `stale` → "Refresh and try again." The draft is single-owner so a
 *   stale token is rare but possible (two tabs open).
 * - everything else → generic "Couldn't create — try again."
 */
export function FinalizeButton({
  characterId,
  identityVersion,
  canFinalize,
}: {
  characterId: string
  identityVersion: number
  canFinalize: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    if (!canFinalize) return
    startTransition(async () => {
      const result = await finalizeCharacterAction({
        characterId,
        expectedVersion: identityVersion,
      })
      if (result.ok) {
        toast.success("Character created.")
        router.push(`/c/${result.value.shortId}`)
        return
      }
      surfaceError(result.error)
    })
  }

  return (
    <div className="flex items-center justify-end">
      <Button size="lg" onClick={onClick} disabled={isPending || !canFinalize}>
        {isPending ? <Spinner /> : <CheckCircleIcon weight="fill" />}
        Create character
      </Button>
    </div>
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
  toast.error("Couldn't create your character — try again.")
}
