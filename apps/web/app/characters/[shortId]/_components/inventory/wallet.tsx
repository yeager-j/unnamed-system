"use client"

import { CoinsIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { MAX_CURRENCY } from "@workspace/game-v2/items"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { useViewerRole } from "@/components/shell/viewer-role"
import { useEntityWrite } from "@/domain/entity/use-entity-write"

/**
 * The wallet (S2c — UNN-559): the gp readout plus the owner's coin-button
 * adjust popover — the `AdjustPoolControl` shape (amount + Add/Remove), one
 * `addCurrency`/`removeCurrency` delta descriptor per click, so the table says
 * what changed and the engine does the arithmetic (back-to-back adjustments
 * sum; an over-spend clamps at 0). Reads the optimistic frame via its prop,
 * so the readout moves in the same interaction.
 */
export function Wallet({ currency }: { currency: number }) {
  const role = useViewerRole()
  const { dispatch, pending } = useEntityWrite()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  // Number(...) over parseInt: "1.5"/"1e3" must fail the integer check as the
  // value they represent, not silently truncate to a passing prefix. An empty
  // draft is NaN, not Number("")'s 0.
  const amount = draft.trim() === "" ? Number.NaN : Number(draft)
  const valid =
    Number.isInteger(amount) && amount >= 1 && amount <= MAX_CURRENCY

  const apply = (op: "addCurrency" | "removeCurrency") => {
    if (!valid) return
    setOpen(false)
    dispatch(
      { component: "equipment", op, amount },
      { messages: { error: "Couldn't update the wallet. Try again." } }
    )
  }

  const readout = (
    <span className="text-sm text-muted-foreground tabular-nums">
      {currency.toLocaleString()} gp
    </span>
  )

  if (role !== "owner") return readout

  return (
    <div className="flex items-center gap-1.5">
      {readout}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setDraft("")
        }}
      >
        <PopoverTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label="Adjust gold" />
          }
        >
          <CoinsIcon aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-56 flex-col gap-2 p-3">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="Amount"
            aria-label="Adjust gold amount"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply("addCurrency")
            }}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="sm"
              disabled={pending || !valid}
              onClick={() => apply("addCurrency")}
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !valid}
              onClick={() => apply("removeCurrency")}
            >
              Remove
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
