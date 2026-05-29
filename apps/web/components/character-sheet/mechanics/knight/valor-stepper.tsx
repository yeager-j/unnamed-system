"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"

import { useCharacterWrite } from "@/hooks/use-character"
import { adjustValorAction } from "@/lib/actions/mechanics/knight/valor"
import { VALOR_MAX } from "@/lib/game/mechanics"

/**
 * Owner-mode +/- stepper for the Knight's Valor counter (UNN-227). Dispatches
 * a `valor` {@link CharacterEdit} through the shared write path; the optimistic
 * value is re-derived on the active Archetype's mechanic state, so the pips and
 * fraction (read off the optimistic character) move in the same frame. `value`
 * is the current count, used only for the clamp-gate on the buttons.
 */
export function ValorStepper({ value }: { value: number }) {
  const { pending, write, characterId } = useCharacterWrite()

  function dispatch(direction: "increment" | "decrement") {
    write({
      edit: { kind: "valor", direction },
      characterClass: "vitals",
      action: (expectedVersion) =>
        adjustValorAction({ characterId, direction, expectedVersion }),
    })
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Decrease Valor"
        disabled={pending || value <= 0}
        onClick={() => dispatch("decrement")}
      >
        <MinusIcon weight="bold" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Increase Valor"
        disabled={pending || value >= VALOR_MAX}
        onClick={() => dispatch("increment")}
      >
        <PlusIcon weight="bold" aria-hidden />
      </Button>
    </div>
  )
}
