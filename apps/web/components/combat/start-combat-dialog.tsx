"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import {
  type CombatAdvantage,
  type CombatSide,
  type InitiativeComparison,
} from "@workspace/game/encounter"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"

import {
  COMBAT_ADVANTAGE_SETUP_HINTS,
  COMBAT_ADVANTAGE_SETUP_LABELS,
  COMBAT_FIRST_SIDE_HEADING,
  COMBAT_FIRST_SIDE_TIE_HINT,
  COMBAT_SIDE_LABELS,
} from "@/lib/ui/labels"

import { SideToggle } from "./side-toggle"

/** Display order for the advantage options (neutral in the middle as the
 *  default / common case). */
const ADVANTAGE_ORDER: readonly CombatAdvantage[] = [
  "players",
  "neutral",
  "enemies",
]

/**
 * The start-combat declaration (UNN-303 / rulebook 3.2): the DM picks the opening
 * **advantage** (a players/enemies ambush, or neutral) and — for a neutral start
 * — which **side acts first**. The first-side picker is pre-selected to the
 * higher-Agility side ({@link InitiativeComparison.suggested}, the app's no-dice
 * suggestion) with the comparison shown; the DM can override (e.g. on the
 * rulebook's d20 tie). An ambush forces `firstSide` to the advantaged side.
 *
 * A `Dialog` (not the end-combat `AlertDialog`) because it carries form controls.
 * Confirming hands the resolved `(advantage, firstSide)` to `onStart`, which runs
 * the existing persist → `startCombat` path.
 */
export function StartCombatDialog({
  comparison,
  onStart,
  disabled,
}: {
  comparison: InitiativeComparison
  onStart: (advantage: CombatAdvantage, firstSide: CombatSide) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [advantage, setAdvantage] = useState<CombatAdvantage>("neutral")
  const [neutralFirstSide, setNeutralFirstSide] =
    useState<CombatSide>("players")

  function onOpenChange(next: boolean) {
    if (next) {
      // Reset to the current roster's suggestion each time the dialog opens.
      setAdvantage("neutral")
      setNeutralFirstSide(comparison.suggested ?? "players")
    }
    setOpen(next)
  }

  function confirm() {
    const firstSide = advantage === "neutral" ? neutralFirstSide : advantage
    onStart(advantage, firstSide)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button disabled={disabled}>
            <SwordIcon weight="fill" />
            Start combat
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start combat</DialogTitle>
          <DialogDescription>How does combat begin?</DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={advantage}
          onValueChange={(value) => setAdvantage(value as CombatAdvantage)}
          className="gap-2"
        >
          {ADVANTAGE_ORDER.map((option) => (
            <Label
              key={option}
              className="flex items-start gap-3 rounded-md border p-3 has-data-checked:border-foreground has-data-checked:bg-muted/40"
            >
              <RadioGroupItem value={option} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {COMBAT_ADVANTAGE_SETUP_LABELS[option]}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {COMBAT_ADVANTAGE_SETUP_HINTS[option]}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        {advantage === "neutral" ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {COMBAT_FIRST_SIDE_HEADING}
              </span>
              <SideToggle
                side={neutralFirstSide}
                onChange={setNeutralFirstSide}
              />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              Highest Agility — {COMBAT_SIDE_LABELS.players}{" "}
              {comparison.players.highestAgility ?? "—"} ·{" "}
              {COMBAT_SIDE_LABELS.enemies}{" "}
              {comparison.enemies.highestAgility ?? "—"}
              {comparison.suggested === null
                ? ` · ${COMBAT_FIRST_SIDE_TIE_HINT}`
                : ""}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button className="w-full" onClick={confirm} disabled={disabled}>
            <SwordIcon weight="fill" />
            Start combat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
