"use client"

import {
  COMBAT_SIDES,
  type CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { COMBAT_SIDE_LABELS } from "@/domain/labels"

/**
 * A compact Players/Enemies segmented control bound to one combatant's `side`
 * (UNN-300). Base UI's `ToggleGroup` is single-select by default, so this is a
 * true segmented toggle; `side` is required, so a deselect (empty group value)
 * is ignored — there is always exactly one active side. Labels come from
 * `COMBAT_SIDE_LABELS`, not inline strings.
 */
export function SideToggle({
  side,
  onChange,
  disabled = false,
}: {
  side: CombatSide
  onChange: (side: CombatSide) => void
  disabled?: boolean
}) {
  return (
    <ToggleGroup
      aria-label="Side"
      variant="outline"
      size="sm"
      value={[side]}
      onValueChange={(value) => {
        const next = value[0] as CombatSide | undefined
        if (next) onChange(next)
      }}
    >
      {COMBAT_SIDES.map((value) => (
        <ToggleGroupItem key={value} value={value} disabled={disabled}>
          {COMBAT_SIDE_LABELS[value]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
