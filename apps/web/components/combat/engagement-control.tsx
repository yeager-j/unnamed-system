"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"

import type { EngageableTarget, Engagement } from "@workspace/game/encounter"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { ENGAGEMENT_STATUS_LABELS } from "@/lib/ui/labels"

/**
 * Sets one combatant's **initial engagement** during setup (UNN-301): Free, or
 * Engaged with one or more specific other combatants, referenced by their stable
 * setup id (UNN-301's `CombatantSetup.id`). A `Popover` of checkboxes — ticking
 * ≥1 combatant yields `{ status: "engaged", targetCombatantIds }`; clearing them
 * all reverts to `{ status: "free" }`. Only **same-zone** combatants are offered
 * (the shell filters `options`). Engagement is **mutual** — the shell mirrors the
 * change onto each target via `setEngagementTargets`, so this control only reports
 * the edited combatant's own list. The trigger shows the status + count so the
 * roster reads at a glance.
 */
export function EngagementControl({
  value,
  options,
  onChange,
  disabled,
}: {
  value: Engagement
  options: EngageableTarget[]
  onChange: (engagement: Engagement) => void
  disabled?: boolean
}) {
  const targets = value.status === "engaged" ? value.targetCombatantIds : []

  function toggle(id: string) {
    const next = targets.includes(id)
      ? targets.filter((target) => target !== id)
      : [...targets, id]
    onChange(
      next.length === 0
        ? { status: "free" }
        : { status: "engaged", targetCombatantIds: next }
    )
  }

  const triggerLabel =
    value.status === "engaged"
      ? `${ENGAGEMENT_STATUS_LABELS.engaged} (${targets.length})`
      : ENGAGEMENT_STATUS_LABELS.free

  if (options.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {ENGAGEMENT_STATUS_LABELS.free}
      </span>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={value.status === "engaged" ? "secondary" : "outline"}
            size="sm"
            disabled={disabled}
            aria-label="Engagement"
          />
        }
      >
        <SwordIcon weight="bold" />
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Engaged with
        </p>
        <ul className="flex flex-col">
          {options.map((option) => {
            const checked = targets.includes(option.id)
            return (
              <li key={option.id}>
                <Label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(option.id)}
                  />
                  <span className="truncate">{option.label}</span>
                </Label>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
