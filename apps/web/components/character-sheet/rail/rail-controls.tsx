"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { useEntityWrite } from "@/hooks/use-entity-write"
import type { RailView } from "@/lib/character/view/rail-view"

import { RestDialog } from "./rest-dialog"

type ControlKey = "hp" | "sp" | "victories"

/**
 * The rail's 2×2 control group (design handoff "Controls"): Adjust HP /
 * Adjust SP popovers, Rest (a dialog — the rulebook's three rest variants
 * replace the prototype's instant restore), and the Victories popover (award,
 * correct, and the explicit Level Up when 7 are banked — the spend grants +2
 * saved ranks, so it stays a visible action rather than an auto-rollover).
 * One popover open at a time; owner-only as a block.
 */
export function RailControls({ view }: { view: RailView }) {
  const [open, setOpen] = useState<ControlKey | null>(null)
  const toggle = (key: ControlKey) => (next: boolean) =>
    setOpen(next ? key : null)

  return (
    <OwnerOnly>
      <section aria-label="Controls" className="grid grid-cols-2 gap-1.5">
        {view.hp ? (
          <AdjustPoolControl
            label="Adjust HP"
            component="vitals"
            positiveLabel="Heal"
            negativeLabel="Damage"
            open={open === "hp"}
            onOpenChange={toggle("hp")}
          />
        ) : null}
        {view.sp ? (
          <AdjustPoolControl
            label="Adjust SP"
            component="skillPool"
            positiveLabel="Restore"
            negativeLabel="Spend"
            open={open === "sp"}
            onOpenChange={toggle("sp")}
          />
        ) : null}
        <RestDialog />
        {view.victories ? (
          <VictoriesControl
            open={open === "victories"}
            onOpenChange={toggle("victories")}
            canLevelUp={view.victories.canLevelUp}
            banked={view.victories.banked}
          />
        ) : null}
      </section>
    </OwnerOnly>
  )
}

/**
 * A pool-adjust popover: number input + the two signed buttons. Each click is
 * one `damage`/`heal` descriptor — the server merges against its own row, so
 * back-to-back clicks sum (UNN-226 is structural now).
 */
function AdjustPoolControl({
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

/** Award / correct Victories; Level Up appears once 7 are banked. */
function VictoriesControl({
  open,
  onOpenChange,
  canLevelUp,
  banked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canLevelUp: boolean
  banked: number
}) {
  const { dispatch, pending } = useEntityWrite()

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
        Victories
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-56 flex-col gap-1.5 p-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => dispatch({ component: "level", op: "awardVictory" })}
        >
          + Award Victory
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || banked === 0}
          onClick={() => dispatch({ component: "level", op: "removeVictory" })}
        >
          − Remove Victory
        </Button>
        {canLevelUp ? (
          <Button
            size="sm"
            variant="outline"
            className="border-gold/60 text-gold hover:bg-gold/10 hover:text-gold"
            disabled={pending}
            onClick={() => {
              dispatch({ component: "level", op: "levelUp" })
              onOpenChange(false)
            }}
          >
            Level Up
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
