"use client"

import { CoinsIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { MAX_CURRENCY } from "@workspace/game-v2/items"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { useViewerRole } from "@/components/shell/viewer-role"
import { useEntityWrite } from "@/hooks/use-entity-write"

/**
 * The wallet (S2c — UNN-559): the gp readout plus the owner's coin-button
 * popover, a single set-semantics `equipment.setCurrency` write per save (the
 * inventory-class guard serializes concurrent writers, so the shown amount is
 * what persists). Reads the optimistic frame via its prop, so the readout
 * moves in the same interaction.
 */
export function Wallet({ currency }: { currency: number }) {
  const role = useViewerRole()
  const { dispatch } = useEntityWrite()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  // Number(...) over parseInt: "1.5"/"1e3" must fail the integer check as the
  // value they represent, not silently truncate to a passing prefix. An empty
  // draft is NaN, not Number("")'s 0.
  const amount = draft.trim() === "" ? Number.NaN : Number(draft)
  const valid =
    Number.isInteger(amount) && amount >= 0 && amount <= MAX_CURRENCY

  const save = () => {
    if (!valid) return
    setOpen(false)
    dispatch(
      { component: "equipment", op: "setCurrency", amount },
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
          if (next) setDraft(String(currency))
        }}
      >
        <PopoverTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label="Edit gold" />
          }
        >
          <CoinsIcon aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
          >
            <Label htmlFor="wallet-gold">Gold</Label>
            <Input
              id="wallet-gold"
              type="number"
              min={0}
              max={MAX_CURRENCY}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
            />
            <Button type="submit" size="sm" disabled={!valid}>
              Save
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}
