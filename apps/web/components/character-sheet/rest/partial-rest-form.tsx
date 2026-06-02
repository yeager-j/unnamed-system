import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { validateDiceInput } from "./validate-dice-input"

/**
 * The Partial Rest variant: HP restored to max, then the player spends Skill
 * Dice (d{skillDie}) and adds their externally-rolled total to SP. Spent dice
 * are not regained until a Full Rest.
 */
export function PartialRestForm({
  skillDie,
  skillDiceRemaining,
  disabled,
  onSubmit,
}: {
  skillDie: number
  skillDiceRemaining: number
  disabled: boolean
  onSubmit: (skillDiceSpent: number, spRecovered: number) => void
}) {
  const [diceSpent, setDiceSpent] = useState("0")
  const [spRecovered, setSpRecovered] = useState("0")

  const { value: diceSpentParsed, invalid: diceInvalid } = validateDiceInput(
    diceSpent,
    skillDiceRemaining
  )
  const { value: spRecoveredParsed, invalid: spInvalid } =
    validateDiceInput(spRecovered)

  function submit() {
    if (diceInvalid || spInvalid) return
    onSubmit(diceSpentParsed, spRecoveredParsed)
  }

  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-xs/relaxed text-muted-foreground">
        HP restored to max. Roll any number of unspent Skill Dice (d{skillDie})
        and add the total to SP. Dice spent are not regained until a Full Rest.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partial-skill-dice" className="text-xs">
            Skill Dice to spend
          </Label>
          <Input
            id="partial-skill-dice"
            type="number"
            inputMode="numeric"
            min={0}
            max={skillDiceRemaining}
            value={diceSpent}
            onChange={(event) => setDiceSpent(event.target.value)}
            aria-invalid={diceInvalid || undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partial-sp-recovered" className="text-xs">
            SP recovered
          </Label>
          <Input
            id="partial-sp-recovered"
            type="number"
            inputMode="numeric"
            min={0}
            value={spRecovered}
            onChange={(event) => setSpRecovered(event.target.value)}
            aria-invalid={spInvalid || undefined}
          />
        </div>
      </div>
      <Button
        onClick={submit}
        disabled={disabled || diceInvalid || spInvalid}
        className="self-end"
      >
        Take Partial Rest
      </Button>
    </div>
  )
}
