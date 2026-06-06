"use client"

import {
  ArrowCounterClockwiseIcon,
  MinusIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { type ReactNode } from "react"

import { PERFECTION_RANK_LABELS } from "@workspace/game/mechanics"
import { Button } from "@workspace/ui/components/button"

import { useCharacterWrite } from "@/hooks/use-character"
import {
  adjustPerfectionAction,
  resetPerfectionAction,
} from "@/lib/actions/mechanics/warrior/perfection"

const MAX_RANK = PERFECTION_RANK_LABELS.length - 1

/**
 * Owner-mode controls for the Warrior's Perfection counter (UNN-228). The
 * step `−` / `+` flank the focal rank letter in the widget, and "Reset to D"
 * sits beneath the ladder, so the controls can't be one self-contained
 * component without leaking layout decisions out of the widget.
 *
 * Dispatch flows through the shared {@link useCharacterWrite} path as a
 * `perfection` {@link CharacterEdit}; the optimistic rank is re-derived on the
 * active Archetype's mechanic state, so the widget reads the in-flight value
 * straight off the optimistic character (`state.rank`). `rank` here is only
 * the current value for the clamp-gate on the buttons.
 */
export function usePerfectionControls({ rank }: { rank: number }): {
  stepButtons: ReactNode
  resetButton: ReactNode
} {
  const { pending, write, characterId } = useCharacterWrite()

  function step(direction: "increment" | "decrement") {
    write({
      edit: { kind: "perfection", op: direction },
      surface: "mechanic",
      action: (expectedVersion) =>
        adjustPerfectionAction({ characterId, direction, expectedVersion }),
    })
  }

  function reset() {
    write({
      edit: { kind: "perfection", op: "reset" },
      surface: "mechanic",
      action: (expectedVersion) =>
        resetPerfectionAction({ characterId, expectedVersion }),
    })
  }

  const atMin = rank <= 0
  const atMax = rank >= MAX_RANK

  return {
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
