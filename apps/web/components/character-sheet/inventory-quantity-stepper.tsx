"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

/**
 * Owner-mode quantity adjuster for a stackable inventory row (UNN-223). The
 * +/- buttons and the direct numeric input all emit the **absolute** next
 * quantity; the parent dispatches `setInventoryItemQuantity` (which clamps to
 * the item's stack size server-side and removes the row at 0). Decrementing at
 * quantity 1 emits 0, removing the row. The disabled-at-max gate is a courtesy;
 * the server is the authority.
 */
export function InventoryQuantityStepper({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number
  max: number
  disabled?: boolean
  onChange: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  // Re-sync the editable draft whenever the committed value changes (a +/- tap
  // or the optimistic frame settling) — React's render-phase pattern for
  // adjusting state to a prop, avoiding a cascading-render effect.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(String(value))
  }

  function commit(raw: string) {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.max(0, Math.min(max, parsed))
    if (clamped === value) setDraft(String(value))
    else onChange(clamped)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Decrease quantity"
        disabled={disabled}
        onClick={() => onChange(value - 1)}
      >
        <MinusIcon weight="bold" aria-hidden />
      </Button>
      <Input
        aria-label="Quantity"
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        className="h-7 w-16 text-center tabular-nums"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(event.currentTarget.value)
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <PlusIcon weight="bold" aria-hidden />
      </Button>
    </div>
  )
}
