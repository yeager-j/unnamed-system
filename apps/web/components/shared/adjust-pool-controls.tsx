"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

/**
 * Adjust-pool UI primitives (PRD §6.1, UNN-155). One amount input plus two
 * action buttons, wrapped in a desktop popover (`AdjustPoolPopover`).
 * Pool-agnostic: the caller supplies the labels and the increment / decrement
 * callbacks, so the same form drives both HP and SP adjustments.
 *
 * Cross-feature primitive (`components/shared/`): the sheet and watch owner
 * controls drive it through `useEntityWrite`; the combat drawer supplies its
 * DM-authorized component-write callbacks.
 */

export function AdjustPoolForm({
  inputId,
  decrementLabel,
  incrementLabel,
  disabled = false,
  onDecrement,
  onIncrement,
  onAfterSubmit,
}: {
  inputId: string
  decrementLabel: string
  incrementLabel: string
  /** Disable both action buttons while a write is in flight (the entity-write
   *  callers pass `pending`); the input stays editable. Default false. */
  disabled?: boolean
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
          disabled={disabled}
          onClick={() => submit(onDecrement)}
        >
          {decrementLabel}
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => submit(onIncrement)}
        >
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
  disabled = false,
  busy = false,
  onDecrement,
  onIncrement,
}: {
  label: string
  icon: React.ReactNode
  decrementLabel: string
  incrementLabel: string
  /** Hard-disable the trigger (creation/destructive callers). Default false. */
  disabled?: boolean
  /** A background write is in flight: the trigger stays clickable but reports
   *  `aria-busy` for screen readers (UNN-482's spam-safe steppers). */
  busy?: boolean
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
            aria-busy={busy}
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
