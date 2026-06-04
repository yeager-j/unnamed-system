"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

/**
 * Adjust-pool UI primitives (PRD §6.1, UNN-155). One amount input plus two
 * action buttons, wrapped in either a desktop popover (`AdjustPoolPopover`)
 * or a mobile centered dialog (`AdjustPoolDialog`). Pool-agnostic: the caller
 * supplies the labels and the increment / decrement callbacks, so the same
 * form drives both HP and SP adjustments.
 *
 * Cross-feature primitive (`components/shared/`): the character sheet's
 * owner-actions affordance and the combat console's drawer VITALS section
 * (UNN-309) both drive it — the sheet through `useCharacterWrite`, the console
 * through the DM-authorized pools actions / the `adjustEnemyVitals` event.
 */

export function AdjustPoolForm({
  inputId,
  decrementLabel,
  incrementLabel,
  onDecrement,
  onIncrement,
  onAfterSubmit,
}: {
  inputId: string
  decrementLabel: string
  incrementLabel: string
  onDecrement: (amount: number) => void
  onIncrement: (amount: number) => void
  onAfterSubmit: () => void
}) {
  const [amount, setAmount] = useState("1")

  function submit(handler: (amount: number) => void) {
    const parsed = Number.parseInt(amount, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    handler(parsed)
    setAmount("1")
    onAfterSubmit()
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={inputId} className="text-xs">
        Amount
      </Label>
      <Input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={1}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            submit(onDecrement)
          }
        }}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => submit(onDecrement)}
        >
          {decrementLabel}
        </Button>
        <Button size="sm" onClick={() => submit(onIncrement)}>
          {incrementLabel}
        </Button>
      </div>
    </div>
  )
}

export function AdjustPoolPopover({
  label,
  icon,
  decrementLabel,
  incrementLabel,
  disabled,
  onDecrement,
  onIncrement,
}: {
  label: string
  icon: React.ReactNode
  decrementLabel: string
  incrementLabel: string
  disabled: boolean
  onDecrement: (amount: number) => void
  onIncrement: (amount: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label={label}
          >
            {icon}
            {label}
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-60">
        <AdjustPoolForm
          inputId={`${label}-amount`}
          decrementLabel={decrementLabel}
          incrementLabel={incrementLabel}
          onDecrement={onDecrement}
          onIncrement={onIncrement}
          onAfterSubmit={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

export function AdjustPoolDialog({
  open,
  onOpenChange,
  title,
  decrementLabel,
  incrementLabel,
  onDecrement,
  onIncrement,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  decrementLabel: string
  incrementLabel: string
  onDecrement: (amount: number) => void
  onIncrement: (amount: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Enter an amount, then choose {decrementLabel} or {incrementLabel}.
          </DialogDescription>
        </DialogHeader>
        <AdjustPoolForm
          inputId={`${title}-mobile-amount`}
          decrementLabel={decrementLabel}
          incrementLabel={incrementLabel}
          onDecrement={onDecrement}
          onIncrement={onIncrement}
          onAfterSubmit={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
