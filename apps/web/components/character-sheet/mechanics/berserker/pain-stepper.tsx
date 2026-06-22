"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"

import { FRENZY_PAIN_MAX } from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"

import { useCharacterWrite } from "@/hooks/use-character"
import { adjustPainAction } from "@/lib/actions/mechanics/berserker/frenzy"

/**
 * Owner-mode +/- stepper for the Berserker's Pain Meter. Dispatches a
 * `frenzyPain` {@link CharacterEdit} through the shared write path; the
 * optimistic value is re-derived on the active Archetype's mechanic state, so
 * the segmented bar and fraction move in the same frame. `value` is the current
 * Pain, used only for the clamp-gate on the buttons. Decrementing to 0 also
 * exits Frenzy Mode (the pure transition handles it).
 */
export function PainStepper({ value }: { value: number }) {
  const { pending, write, characterId } = useCharacterWrite()

  function dispatch(direction: "increment" | "decrement") {
    write({
      edit: { kind: "frenzyPain", direction },
      surface: "mechanic",
      action: (expectedVersion) =>
        adjustPainAction({ characterId, direction, expectedVersion }),
    })
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Decrease Pain"
        aria-busy={pending}
        disabled={value <= 0}
        onClick={() => dispatch("decrement")}
      >
        <MinusIcon weight="bold" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Increase Pain"
        aria-busy={pending}
        disabled={value >= FRENZY_PAIN_MAX}
        onClick={() => dispatch("increment")}
      >
        <PlusIcon weight="bold" aria-hidden />
      </Button>
    </div>
  )
}
