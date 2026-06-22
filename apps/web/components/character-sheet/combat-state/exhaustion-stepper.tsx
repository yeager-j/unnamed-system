"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"

import { MAX_EXHAUSTION_LEVEL } from "@workspace/game/engine"
import { Button } from "@workspace/ui/components/button"

import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { adjustExhaustionAction } from "@/lib/actions/combat-state"

/**
 * The owner-mode +/- stepper for Exhaustion (UNN-226). Manual correction
 * only — Full Rest (UNN-156) is the canonical reducer; these buttons are for
 * fixing up a mis-clicked value or applying a DM ruling outside the normal
 * Rest flow. Clamp guarantees live on both the disabled buttons and the
 * server-side clamp; the UI gate is a courtesy, not the authority.
 */
export function ExhaustionStepper() {
  const { exhaustion } = useCharacter()
  const { pending, write, characterId } = useCharacterWrite()

  function step(direction: "increment" | "decrement") {
    write({
      edit: { kind: "exhaustion", direction },
      surface: "exhaustion",
      action: (expectedVersion) =>
        adjustExhaustionAction({ characterId, direction, expectedVersion }),
    })
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Decrease exhaustion"
        aria-busy={pending}
        disabled={exhaustion <= 0}
        onClick={() => step("decrement")}
      >
        <MinusIcon weight="bold" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Increase exhaustion"
        aria-busy={pending}
        disabled={exhaustion >= MAX_EXHAUSTION_LEVEL}
        onClick={() => step("increment")}
      >
        <PlusIcon weight="bold" aria-hidden />
      </Button>
    </div>
  )
}
