"use client"

import {
  ArrowCounterClockwiseIcon,
  MinusIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { useOptimistic, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import {
  adjustPerfectionAction,
  resetPerfectionAction,
} from "@/lib/actions/mechanics/warrior/perfection"
import { PERFECTION_RANK_LABELS } from "@/lib/game/mechanics"

const MAX_RANK = PERFECTION_RANK_LABELS.length - 1

type Mutation = { kind: "step"; delta: 1 | -1 } | { kind: "reset" }

/**
 * Owner-mode controls for the Warrior's Perfection counter (UNN-228). The
 * step `−` / `+` flank the focal rank letter in the widget, and "Reset to
 * D" sits beneath the ladder as a deliberate action — so the controls
 * can't be one self-contained component without leaking layout decisions
 * out of the widget.
 *
 * The hook owns the optimistic rank + pending state + action dispatch in
 * one place; the widget reads `optimisticRank` for the big-letter / bonus
 * / ladder display so all three update in lockstep with the buttons.
 * Structurally analogous to {@link ValorStepper} — Valor only has one
 * placement so it stays a component; Perfection earns the hook because
 * the rulebook gives it a non-delta operation (Reset).
 */
export function usePerfectionControls({
  characterId,
  rank,
  vitalsVersion,
}: {
  characterId: string
  rank: number
  vitalsVersion: number
}): {
  optimisticRank: number
  stepButtons: ReactNode
  resetButton: ReactNode
} {
  const versionRef = useCharacterTokenRef(vitalsVersion)
  const [pending, startTransition] = useTransition()
  const [optimisticRank, applyOptimistic] = useOptimistic(
    rank,
    (current: number, mutation: Mutation) => {
      if (mutation.kind === "reset") return 0
      return Math.max(0, Math.min(MAX_RANK, current + mutation.delta))
    }
  )

  function step(direction: "increment" | "decrement") {
    startTransition(async () => {
      applyOptimistic({
        kind: "step",
        delta: direction === "increment" ? 1 : -1,
      })
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "vitals",
        versionRef,
        action: (expectedVersion) =>
          adjustPerfectionAction({ characterId, direction, expectedVersion }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  function reset() {
    startTransition(async () => {
      applyOptimistic({ kind: "reset" })
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "vitals",
        versionRef,
        action: (expectedVersion) =>
          resetPerfectionAction({ characterId, expectedVersion }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  const atMin = optimisticRank <= 0
  const atMax = optimisticRank >= MAX_RANK

  return {
    optimisticRank,
    stepButtons: (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Decrease Perfection"
          disabled={pending || atMin}
          onClick={() => step("decrement")}
        >
          <MinusIcon weight="bold" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Increase Perfection"
          disabled={pending || atMax}
          onClick={() => step("increment")}
        >
          <PlusIcon weight="bold" aria-hidden />
        </Button>
      </div>
    ),
    resetButton: (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Reset Perfection to D"
        disabled={pending || atMin}
        onClick={reset}
      >
        <ArrowCounterClockwiseIcon weight="bold" aria-hidden />
        Reset to D
      </Button>
    ),
  }
}
