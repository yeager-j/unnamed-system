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

import { useEntityIdentityQueue } from "@/domain/entity/use-entity-write"
import { finalizeEntityAction } from "@/lib/actions/entity/finalize"
import type { FinalizeEntityError } from "@/lib/actions/entity/finalize.schema"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * Movement 4's commit button (ADR-002 §"Movement 4 — The Person"). Flips the
 * draft to `finalized` via the Server Action and routes to My Characters on
 * success (the v2 sheet route arrives with S2a — UNN-557). The label is
 * exactly "Finalize character" per the ticket — not "Continue", not "Next",
 * not "Create."
 *
 * Disabled until every gated movement passes (`canFinalize` comes from
 * `findStepGateFailures(draft).length === 0` in `PersonaStep`). When disabled,
 * the failure reason surfaces as a tooltip so the player can see what's
 * blocking them without having to navigate back.
 */
export function FinalizeButton({
  canFinalize,
  disabledReason,
}: {
  canFinalize: boolean
  disabledReason?: string
}) {
  const identityQueue = useEntityIdentityQueue()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const disabled = isPending || !canFinalize

  function onClick() {
    if (!canFinalize) return
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await identityQueue.enqueueOnce((expectedVersion) =>
            finalizeEntityAction({
              entityId: identityQueue.entityId,
              expectedVersion,
            })
          )
          if (result.ok) {
            toast.success("Character finalized.")
            router.push("/")
            return
          }
          surfaceError(result.error)
          // Re-run the server render so a stale draft (e.g. another tab cleared
          // a field between our render and click) picks up the latest gate
          // failures.
          router.refresh()
        },
        () => toast.error("Couldn't finalize your character — try again.")
      )
    )
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

function surfaceError(error: FinalizeEntityError): void {
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
  if (error === "entity-not-found") {
    toast.error("This draft no longer exists. Refresh to see your characters.")
    return
  }
  toast.error("Couldn't finalize your character — try again.")
}
