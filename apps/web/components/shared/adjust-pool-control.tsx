"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { useEntityWrite } from "@/domain/entity/use-entity-write"

/**
 * A pool-adjust popover: number input + the two signed buttons. Each click is
 * one `damage`/`heal` descriptor — the server merges against its own row, so
 * back-to-back clicks sum (UNN-226 is structural now).
 *
 * Rendered by the sheet's rail controls and by the watch view's own-sheet
 * column (UNN-566), which is why it isn't inlined in either.
 */
export function AdjustPoolControl({
  label,
  component,
  positiveLabel,
  negativeLabel,
  open,
  onOpenChange,
}: {
  label: string
  component: "vitals" | "skillPool"
  positiveLabel: string
  negativeLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dispatch, pending } = useEntityWrite()
  const [amount, setAmount] = useState("")

  const parsed = Number.parseInt(amount, 10)
  const valid = Number.isInteger(parsed) && parsed > 0

  const apply = (op: "damage" | "heal") => {
    if (!valid) return
    dispatch({ component, op, amount: parsed })
    setAmount("")
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant={open ? "secondary" : "outline"}
            size="sm"
            className="w-full"
          />
        }
      >
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-56 flex-col gap-2 p-3">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          placeholder="Amount"
          aria-label={`${label} amount`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") apply("heal")
          }}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            disabled={pending || !valid}
            onClick={() => apply("heal")}
          >
            {positiveLabel}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !valid}
            onClick={() => apply("damage")}
          >
            {negativeLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
