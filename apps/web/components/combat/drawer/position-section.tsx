"use client"

import {
  ArrowsOutCardinalIcon,
  MapPinIcon,
} from "@phosphor-icons/react/dist/ssr"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceEvent } from "@workspace/game-v2/spatial"
import { Badge } from "@workspace/ui/components/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { DetailSection } from "@/components/shared/detail-section"
import type { CombatantPosition } from "@/domain/combat/view/detail-view"

/**
 * The drawer's **POSITION** section (UNN-315, on v2's spatial vocabulary): the
 * combatant's current zone plus a "Move to…" select of its valid targets — the
 * **adjacent** zones when placed (rulebook §3.5), or every zone when unplaced.
 * A placed combatant travels via `moveCombatant` (move-with-engagement-sever);
 * an **unplaced** one has no token to move, so its first placement dispatches
 * the upserting `placeCombatant` instead (the mid-combat joiner affordance —
 * `moveCombatant` would no-op on a missing token).
 */
export function CombatantPositionSection({
  participantId,
  position,
  onCombatEvent,
}: {
  participantId: ParticipantId
  position: CombatantPosition | null
  onCombatEvent: (event: MapInstanceEvent) => void
}) {
  if (position === null) {
    return (
      <DetailSection title="Position">
        <p className="text-sm text-muted-foreground">
          This encounter has no zones.
        </p>
      </DetailSection>
    )
  }

  const placed = position.current !== null

  function move(zoneId: string) {
    onCombatEvent(
      placed
        ? { kind: "moveCombatant", tokenKey: participantId, toZoneId: zoneId }
        : { kind: "placeCombatant", tokenKey: participantId, zoneId }
    )
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
                <span className="text-muted-foreground">
                  {placed ? "Move to…" : "Place in…"}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              {position.targets.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  {target.name}
                  {target.pageLabel ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {target.pageLabel}
                    </span>
                  ) : null}
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
