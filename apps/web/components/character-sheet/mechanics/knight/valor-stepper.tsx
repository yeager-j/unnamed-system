"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { adjustValorAction } from "@/lib/actions/mechanics/knight/valor"
import { VALOR_MAX } from "@/lib/game/mechanics"

/**
 * Owner-mode +/- stepper for the Knight's Valor counter (UNN-227). Clamps
 * to `[0, VALOR_MAX]`; the disabled-button gate is a courtesy, the pure
 * {@link adjustValor} transition on the server is the authority.
 *
 * Modelled directly on {@link ExhaustionStepper}: optimistic update via the
 * same direction-coerced delta the server applies, then dispatch through
 * {@link dispatchCharacterWriteWithRetry} on the `vitals` write class.
 */
export function ValorStepper({
  characterId,
  value,
  vitalsVersion,
}: {
  characterId: string
  value: number
  vitalsVersion: number
}) {
  const versionRef = useCharacterTokenRef(vitalsVersion)
  const [pending, startTransition] = useTransition()
  const [optimisticValue, applyOptimistic] = useOptimistic(
    value,
    (current: number, direction: "increment" | "decrement") =>
      direction === "increment"
        ? Math.min(VALOR_MAX, current + 1)
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
          adjustValorAction({ characterId, direction, expectedVersion }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  const atMin = optimisticValue <= 0
  const atMax = optimisticValue >= VALOR_MAX

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Decrease Valor"
        disabled={pending || atMin}
        onClick={() => dispatch("decrement")}
      >
        <MinusIcon weight="bold" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Increase Valor"
        disabled={pending || atMax}
        onClick={() => dispatch("increment")}
      >
        <PlusIcon weight="bold" aria-hidden />
      </Button>
    </div>
  )
}
