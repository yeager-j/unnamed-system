"use client"

import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import { NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapZone } from "@workspace/game-v2/spatial"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { FloatingEdgeHandles } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/floating-edge-handles"
import { EngagedCluster } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/engaged-cluster"
import { ZoneEnchantmentControl } from "@/components/combat/controls/zone-enchantment"
import { useConnectionHighlight } from "@/components/shared/canvas/hovered-connection-context"
import { clustersOf } from "@/components/shared/canvas/set-piece/occupant-chips"
import { ZoneSetPiece } from "@/components/shared/canvas/set-piece/zone-set-piece"
import { EnchantmentBadge } from "@/components/shared/enchantment-badge"
import type { RailRow } from "@/domain/combat/view/roster-view"
import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"
import { combatZoneView } from "@/domain/dungeon/view/set-piece-view"
import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

import { useDungeonCombatCanvas } from "./context"
import { CombatRosterToken } from "./roster-token"

export type DungeonCombatZoneData = {
  zone: MapZone
  revealed: boolean
  /** The combatants standing here (the console `RosterView` rows), the raw
   *  material for the zone view + its Closeup roster. */
  rows: RailRow[]
  /** The Zone's active Bard Enchantment, when the Instance's singleton sits here. */
  enchantment?: ZoneEnchantmentBadge
}
export type DungeonCombatZoneNode = Node<
  DungeonCombatZoneData,
  "dungeonCombatZone"
>

/**
 * A Zone on the **combat** battlefield (UNN-536) — a thin wrapper over the shared
 * {@link ZoneSetPiece} tiered card (Dungeon Visual Overhaul §D3). It builds the
 * zone view from the console roster rows (disjoint melee clusters, the acting
 * token ringed), carries the Bard {@link ZoneEnchantmentControl}, and — while a
 * combatant is acting and this Zone is a legal move target — surfaces a floating
 * "Move {actor} here" action. Tapping a token opens the detail drawer. All
 * dispatchers come from {@link useDungeonCombatCanvas}.
 */
export function DungeonCombatZoneNode({
  data,
}: NodeProps<DungeonCombatZoneNode>) {
  const {
    actingName,
    movableZoneIds,
    onMoveActing,
    onSelectCombatant,
    onCombatEvent,
    onInspect,
    disabled,
  } = useDungeonCombatCanvas()
  const { zone, revealed, rows, enchantment } = data
  const view = combatZoneView({ zone, revealed, rows })
  const partnerHighlighted = useConnectionHighlight(zone.id)
  const isMoveTarget = movableZoneIds.includes(zone.id)
  const showMove = isMoveTarget && actingName !== null

  const tokenButton = (occupant: SetPieceOccupant) => (
    <CombatRosterToken
      occupant={occupant}
      onSelect={(key) => onSelectCombatant(key as ParticipantId)}
    />
  )

  return (
    <ZoneSetPiece
      view={view}
      partnerHighlighted={partnerHighlighted}
      className={cn(
        isMoveTarget &&
          "ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
      )}
      onOpenRoster={() => onInspect(zone.id)}
      handles={<FloatingEdgeHandles />}
      titleAccessory={
        enchantment ? <EnchantmentBadge enchantment={enchantment} /> : null
      }
      headerAction={
        <ZoneEnchantmentControl
          zoneId={zone.id}
          zoneName={zone.name}
          enchantment={enchantment}
          onCombatEvent={onCombatEvent}
          disabled={disabled}
        />
      }
      toolbar={
        showMove ? (
          <NodeToolbar
            isVisible
            position={Position.Bottom}
            className="rounded-none border bg-popover p-1 shadow-md"
          >
            <Button
              size="sm"
              disabled={disabled}
              onClick={() => onMoveActing(zone.id)}
            >
              <ArrowRightIcon weight="bold" />
              Move {actingName} here
            </Button>
          </NodeToolbar>
        ) : undefined
      }
      closeupRoster={
        view.occupants.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {clustersOf(view.occupants).map((cluster) =>
              cluster.length > 1 ? (
                <li key={cluster.map((o) => o.key).join("|")}>
                  <EngagedCluster
                    label={`Engaged: ${cluster.map((o) => o.name).join(", ")}`}
                  >
                    {cluster.map((occupant) => (
                      <div key={occupant.key}>{tokenButton(occupant)}</div>
                    ))}
                  </EngagedCluster>
                </li>
              ) : (
                <li key={cluster[0]!.key}>{tokenButton(cluster[0]!)}</li>
              )
            )}
          </ul>
        ) : undefined
      }
    />
  )
}
