"use client"

import {
  ArrowsOutCardinalIcon,
  MapPinIcon,
} from "@phosphor-icons/react/dist/ssr"

import { type CombatantDetail } from "@workspace/game/engine"
import { type CombatEvent } from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { DetailSection } from "@/components/shared/detail-section"

/**
 * The drawer's **POSITION** section (UNN-315): the combatant's current zone plus
 * a "Move to…" select of its valid travel targets — the **adjacent** zones when
 * placed (rulebook §3.5), or every zone when unplaced (place a mid-combat
 * joiner). Selecting dispatches `moveCombatant` through the same optimistic
 * `onCombatEvent` path the other drawer controls use; the re-render moves the
 * combatant and recomputes the targets. The select is action-style (its value
 * stays the "Move to…" placeholder — you travel *to* a zone, never *to* your
 * own). DM-only is structural (the console route is DM-gated). Engagement is its
 * own section (UNN-316).
 */
export function CombatantPositionSection({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: CombatEvent) => void
}) {
  const position = detail.position

  if (position === null) {
    return (
      <DetailSection title="Position">
        <p className="text-sm text-muted-foreground">
          This encounter has no zones.
        </p>
      </DetailSection>
    )
  }

  function move(toZoneId: string) {
    onCombatEvent({ kind: "moveCombatant", combatantId: detail.id, toZoneId })
  }

  return (
    <DetailSection title="Position">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1">
          <MapPinIcon />
          {position.current?.name ?? "Unplaced"}
        </Badge>

        {position.targets.length > 0 ? (
          <Select
            value=""
            onValueChange={(value) => {
              if (value) move(value)
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="Move to zone"
              className="w-auto gap-1.5"
            >
              <ArrowsOutCardinalIcon aria-hidden />
              <SelectValue>
                <span className="text-muted-foreground">Move to…</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              {position.targets.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">
            No adjacent zones
          </span>
        )}
      </div>
    </DetailSection>
  )
}
