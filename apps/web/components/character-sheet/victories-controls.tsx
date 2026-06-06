"use client"

import { ArrowCounterClockwiseIcon, TrophyIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { VICTORIES_PER_LEVEL } from "@workspace/game/engine"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

/**
 * Victories ± UI primitives (PRD §7.4, UNN-157). Three buttons (Standard /
 * Heroic / Undo) wrapped in either a desktop popover or a mobile centered
 * dialog. Behavior-free: the parent owns dispatch + optimistic state and
 * passes the awarded delta through {@link VictoriesAmount}-typed `onAward`.
 */

export type VictoriesAmount = 1 | 2 | -1

export function VictoriesActions({
  victories,
  undoDisabled,
  disabled,
  onAward,
}: {
  victories: number
  undoDisabled: boolean
  disabled: boolean
  onAward: (amount: VictoriesAmount) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Currently{" "}
        <span className="font-medium text-foreground tabular-nums">
          {victories}/{VICTORIES_PER_LEVEL}
        </span>
      </p>
      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onAward(1)}
        >
          <TrophyIcon weight="fill" aria-hidden />
          Victory (+1)
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onAward(2)}
        >
          <TrophyIcon weight="fill" aria-hidden />
          Heroic Victory (+2)
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={undoDisabled}
          onClick={() => onAward(-1)}
        >
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden />
          Undo (−1)
        </Button>
      </div>
    </div>
  )
}

export function VictoriesPopover({
  victories,
  undoDisabled,
  disabled,
  onAward,
}: {
  victories: number
  undoDisabled: boolean
  disabled: boolean
  onAward: (amount: VictoriesAmount) => void
}) {
  const [open, setOpen] = useState(false)

  function handleAward(amount: VictoriesAmount) {
    onAward(amount)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline" aria-label="Victories">
            <TrophyIcon weight="fill" aria-hidden />
            Victories ({victories}/{VICTORIES_PER_LEVEL})
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-56">
        <VictoriesActions
          victories={victories}
          undoDisabled={undoDisabled}
          disabled={disabled}
          onAward={handleAward}
        />
      </PopoverContent>
    </Popover>
  )
}

export function VictoriesDialog({
  open,
  onOpenChange,
  victories,
  undoDisabled,
  disabled,
  onAward,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  victories: number
  undoDisabled: boolean
  disabled: boolean
  onAward: (amount: VictoriesAmount) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Victories</DialogTitle>
          <DialogDescription className="sr-only">
            Award a Victory, Heroic Victory, or undo the most recent change.
          </DialogDescription>
        </DialogHeader>
        <VictoriesActions
          victories={victories}
          undoDisabled={undoDisabled}
          disabled={disabled}
          onAward={onAward}
        />
      </DialogContent>
    </Dialog>
  )
}
