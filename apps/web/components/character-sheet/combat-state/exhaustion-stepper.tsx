"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { adjustExhaustionAction } from "@/lib/actions/combat-state"
import { MAX_EXHAUSTION_LEVEL } from "@/lib/game/combat"

/**
 * The owner-mode +/- stepper for Exhaustion (UNN-226). Manual correction
 * only — Full Rest (UNN-156) is the canonical reducer; these buttons are for
 * fixing up a mis-clicked value or applying a DM ruling outside the normal
 * Rest flow. Clamp guarantees live on both the disabled `-` button and the
 * server-side `applyAdjustExhaustionForCharacter` clamp; the UI gate is a
 * courtesy, not the authority.
 */
export function ExhaustionStepper({
  characterId,
  exhaustion,
  vitalsVersion,
}: {
  characterId: string
  exhaustion: number
  vitalsVersion: number
}) {
  const versionRef = useCharacterTokenRef(vitalsVersion)
  const [pending, startTransition] = useTransition()
  const [optimisticLevel, applyOptimistic] = useOptimistic(
    exhaustion,
    (current: number, direction: "increment" | "decrement") =>
      direction === "increment"
        ? Math.min(MAX_EXHAUSTION_LEVEL, current + 1)
        : Math.max(0, current - 1)
  )

  function dispatch(direction: "increment" | "decrement") {
    startTransition(async () => {
      applyOptimistic(direction)
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "vitals",
        versionRef,
        action: (expectedVersion) =>
          adjustExhaustionAction({
            characterId,
            direction,
            expectedVersion,
          }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  const atMin = optimisticLevel <= 0
  const atMax = optimisticLevel >= MAX_EXHAUSTION_LEVEL

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Decrease exhaustion"
        disabled={pending || atMin}
        onClick={() => dispatch("decrement")}
      >
        <MinusIcon weight="bold" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Increase exhaustion"
        disabled={pending || atMax}
        onClick={() => dispatch("increment")}
      >
        <PlusIcon weight="bold" aria-hidden />
      </Button>
    </div>
  )
}
