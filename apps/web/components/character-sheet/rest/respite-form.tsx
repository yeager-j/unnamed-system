import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { validateDiceInput } from "./validate-dice-input"

/**
 * The Respite variant: a brief pause. The player spends Hit Dice (d{hitDie})
 * and adds their externally-rolled total to HP. SP is not restored; spent dice
 * are not regained until a Full Rest.
 */
export function RespiteForm({
  hitDie,
  hitDiceRemaining,
  disabled,
  onSubmit,
}: {
  hitDie: number
  hitDiceRemaining: number
  disabled: boolean
  onSubmit: (hitDiceSpent: number, hpRecovered: number) => void
}) {
  const [diceSpent, setDiceSpent] = useState("0")
  const [hpRecovered, setHpRecovered] = useState("0")

  const { value: diceSpentParsed, invalid: diceInvalid } = validateDiceInput(
    diceSpent,
    hitDiceRemaining
  )
  const { value: hpRecoveredParsed, invalid: hpInvalid } =
    validateDiceInput(hpRecovered)

  function submit() {
    if (diceInvalid || hpInvalid) return
    onSubmit(diceSpentParsed, hpRecoveredParsed)
  }

  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-xs/relaxed text-muted-foreground">
        A brief pause. Roll any number of unspent Hit Dice (d{hitDie}) and add
        the total to HP. SP is not restored. Dice spent are not regained until a
        Full Rest.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="respite-hit-dice" className="text-xs">
            Hit Dice to spend
          </Label>
          <Input
            id="respite-hit-dice"
            type="number"
            inputMode="numeric"
            min={0}
            max={hitDiceRemaining}
            value={diceSpent}
            onChange={(event) => setDiceSpent(event.target.value)}
            aria-invalid={diceInvalid || undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="respite-hp-recovered" className="text-xs">
            HP recovered
          </Label>
          <Input
            id="respite-hp-recovered"
            type="number"
            inputMode="numeric"
            min={0}
            value={hpRecovered}
            onChange={(event) => setHpRecovered(event.target.value)}
            aria-invalid={hpInvalid || undefined}
          />
        </div>
      </div>
      <Button
        onClick={submit}
        disabled={disabled || diceInvalid || hpInvalid}
        className="self-end"
      >
        Take Respite
      </Button>
    </div>
  )
}
