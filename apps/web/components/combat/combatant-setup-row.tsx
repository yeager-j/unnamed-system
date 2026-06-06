"use client"

import { XIcon } from "@phosphor-icons/react/dist/ssr"

import { type EngageableTarget } from "@workspace/game/engine"
import {
  type CombatSession,
  type CombatSide,
  type Engagement,
} from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { EngagementControl } from "./engagement-control"
import { SideToggle } from "./side-toggle"

/**
 * One row of the encounter-setup roster (UNN-301). Beyond the side toggle +
 * remove control (UNN-300), it carries the prep-time placement controls: a zone
 * `Select` (only when the DM has authored zones) and an {@link EngagementControl}
 * for the combatant's initial engagement. Placement and engagement mutate the
 * shell's in-progress `CombatantSetup[]` and persist on Save / Start; the zone
 * options come from the live `zones` graph.
 */
export function CombatantSetupRow({
  label,
  side,
  zones,
  zoneId,
  engagement,
  engagementOptions,
  onSideChange,
  onZoneChange,
  onEngagementChange,
  onRemove,
  disabled,
}: {
  label: string
  side: CombatSide
  zones: CombatSession["zones"]
  zoneId: string
  engagement: Engagement
  engagementOptions: EngageableTarget[]
  onSideChange: (side: CombatSide) => void
  onZoneChange: (zoneId: string) => void
  onEngagementChange: (engagement: Engagement) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const zoneList = Object.values(zones)
  const placed = zoneId !== "" && zoneId in zones

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
      </span>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {zoneList.length > 0 ? (
          <Select
            value={zoneId}
            onValueChange={(value) => {
              if (value) onZoneChange(value)
            }}
            disabled={disabled}
          >
            <SelectTrigger
              size="sm"
              aria-label="Zone"
              className={placed ? undefined : "text-muted-foreground"}
            >
              <SelectValue>
                {placed ? zones[zoneId]!.name : "Choose zone"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {zoneList.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <EngagementControl
          value={engagement}
          options={engagementOptions}
          onChange={onEngagementChange}
          disabled={disabled}
        />
        <SideToggle side={side} onChange={onSideChange} />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Remove combatant"
          disabled={disabled}
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      </div>
    </li>
  )
}
