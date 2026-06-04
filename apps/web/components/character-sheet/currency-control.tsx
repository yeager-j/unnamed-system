"use client"

import { CoinsIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { AdjustPoolForm } from "@/components/shared/adjust-pool-controls"
import { OwnerOnly } from "@/components/shell/viewer-role"
import { formatCurrency } from "@/lib/ui/format-currency"

/**
 * The Inventory tab's wallet (PRD §6.1/§7.7, UNN-223). Shows the formatted
 * currency value; in owner mode a coin button opens a popover to Add or Spend.
 * Reuses {@link AdjustPoolForm} so the amount-input + two-button affordance
 * matches the HP/SP adjusters. Spending is dispatched as a negative delta and
 * clamped at 0 server-side; the public sheet sees the value read-only.
 */
export function CurrencyControl({
  currency,
  disabled,
  onAdd,
  onSpend,
}: {
  currency: number
  disabled: boolean
  onAdd: (amount: number) => void
  onSpend: (amount: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatCurrency(currency)}
      </span>
      <OwnerOnly>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                size="icon-xs"
                variant="outline"
                aria-label="Adjust currency"
                disabled={disabled}
              >
                <CoinsIcon weight="bold" aria-hidden />
              </Button>
            }
          />
          <PopoverContent align="end" sideOffset={6} className="w-60">
            <AdjustPoolForm
              inputId="currency-amount"
              decrementLabel="Spend"
              incrementLabel="Add"
              onDecrement={onSpend}
              onIncrement={onAdd}
              onAfterSubmit={() => setOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </OwnerOnly>
    </div>
  )
}
