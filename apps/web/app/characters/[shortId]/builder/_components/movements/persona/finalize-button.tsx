"use client"

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import type { EntityMutationError } from "@/domain/entity/commit/protocol"
import { useFinalizeEntity } from "@/domain/entity/use-entity-write"

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
  const router = useRouter()
  const finalize = useFinalizeEntity()
  const disabled = finalize.pending || !canFinalize

  function onClick() {
    if (!canFinalize) return
    finalize.dispatch({
      onSuccess: () => {
        toast.success("Character finalized.")
        router.push("/")
      },
      onError: (error) => {
        surfaceError(error)
        router.refresh()
        return true
      },
    })
  }

  const button = (
    <Button size="lg" onClick={onClick} disabled={disabled}>
      {finalize.pending ? <Spinner /> : <CheckCircleIcon weight="fill" />}
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

function surfaceError(error: EntityMutationError): void {
  if (typeof error === "object") {
    toast.error(error.reason)
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
  if (error === "entity-not-draft") {
    toast.error("This character has already been finalized.")
    return
  }
  toast.error("Couldn't finalize your character — try again.")
}
