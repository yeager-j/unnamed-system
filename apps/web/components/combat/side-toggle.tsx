"use client"

import { Button } from "@workspace/ui/components/button"

import { COMBAT_SIDES, type CombatSide } from "@/lib/game/encounter"
import { COMBAT_SIDE_LABELS } from "@/lib/ui/labels"

/**
 * A compact Players/Enemies segmented control bound to one combatant's `side`
 * (UNN-300). Always exactly one side is active (it's a required field), so this
 * is two mutually-exclusive buttons rather than a deselectable toggle. Labels
 * come from `COMBAT_SIDE_LABELS`, not inline strings.
 */
export function SideToggle({
  side,
  onChange,
}: {
  side: CombatSide
  onChange: (side: CombatSide) => void
}) {
  return (
    <div
      role="group"
      aria-label="Side"
      className="inline-flex gap-0.5 rounded-md border p-0.5"
    >
      {COMBAT_SIDES.map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={value === side ? "default" : "ghost"}
          aria-pressed={value === side}
          className="h-7"
          onClick={() => onChange(value)}
        >
          {COMBAT_SIDE_LABELS[value]}
        </Button>
      ))}
    </div>
  )
}
