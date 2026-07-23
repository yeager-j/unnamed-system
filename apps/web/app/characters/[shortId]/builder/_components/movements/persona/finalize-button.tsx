"use client"

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { characterFinalize, CharacterRoot } from "@/domain/character/client"
import type { CharacterMutationError } from "@/domain/character/commit/protocol"

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
  const root = CharacterRoot.useRoot()
  const [pending, setPending] = useState(false)
  const disabled = pending || !canFinalize

  function onClick() {
    if (!canFinalize) return
    const result = root.mutate(
      characterFinalize({ entityId: root.value.profile.id }),
      {
        onPrediction: (prediction) => {
          if (prediction.ok) return
          surfaceError(prediction.error)
          router.refresh()
        },
        onAcceptance: (acceptance) => {
          if (acceptance.ok) {
            toast.success("Character finalized.")
            router.push("/")
            return
          }
          if (
            acceptance.error.kind === "domain" ||
            acceptance.error.kind === "replay-refused"
          ) {
            surfaceError(acceptance.error.error)
            router.refresh()
          }
        },
      }
    )
    if (!result.ok) return

    setPending(true)
    void result.value.accepted.then(() => setPending(false))
  }

  const button = (
    <Button size="lg" onClick={onClick} disabled={disabled}>
      {pending ? <Spinner /> : <CheckCircleIcon weight="fill" />}
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

function surfaceError(error: CharacterMutationError): void {
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
