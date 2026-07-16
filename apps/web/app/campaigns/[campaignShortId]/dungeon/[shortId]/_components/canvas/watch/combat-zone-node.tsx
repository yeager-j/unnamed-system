"use client"

import { type Node, type NodeProps } from "@xyflow/react"

import { FloatingEdgeHandles } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/floating-edge-handles"
import { EngagedCluster } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/engaged-cluster"
import { WatchRosterToken } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/roster-token"
import { useConnectionHighlight } from "@/components/shared/canvas/hovered-connection-context"
import { clustersOf } from "@/components/shared/canvas/set-piece/occupant-chips"
import { ZoneSetPiece } from "@/components/shared/canvas/set-piece/zone-set-piece"
import { EnchantmentBadge } from "@/components/shared/enchantment-badge"
import type { WatchCombatant } from "@/domain/combat/view/watch-layout"
import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"
import type {
  SetPieceOccupant,
  ZoneSetPieceView,
} from "@/domain/map/view/set-piece-view"

import { WatchExitStubs, type WatchZoneExit } from "./zone-node"

export type WatchCombatZoneData = {
  view: ZoneSetPieceView
  /** The redacted combatants standing here (the C3 join), keyed by id — the source
   *  for the Closeup roster's condition popover, which the view occupant omits. */
  combatants: WatchCombatant[]
  exits: WatchZoneExit[]
  /** The Zone's active Bard Enchantment badge, when one sits here. */
  enchantment?: ZoneEnchantmentBadge
  /** Docks the watch roster inspector on this Zone (the crowded card's "Open
   *  roster ▸"; §D7). Supplied by the canvas, which owns the watch `inspectId`. */
  onOpenRoster: () => void
}
export type DungeonWatchCombatZoneNode = Node<
  WatchCombatZoneData,
  "fogCombatZone"
>

/**
 * A revealed Zone on the player fog view **while a fight runs on the delve**
 * (UNN-604) — the combat peer of the exploration
 * {@link import("./zone-node").DungeonWatchZoneNode}, a thin wrapper over the
 * shared {@link ZoneSetPiece} card. The party tokens are replaced by the
 * **redacted combatants** standing here (the viewer's own gold, the acting one
 * ringed, melee-locked tokens in dashed clusters). Read-only — no drawer, no move
 * affordances; tapping a token expands the read-only {@link TokenStatsPopover}
 * (numeric HP/SP + ailments + battle conditions, all public overlay state).
 */
export function DungeonWatchCombatZoneNode({
  id,
  data,
}: NodeProps<DungeonWatchCombatZoneNode>) {
  const { view, combatants, exits, enchantment, onOpenRoster } = data
  const partnerHighlighted = useConnectionHighlight(id)
  const byId = new Map(combatants.map((c) => [c.id as string, c]))

  const tokenChip = (occupant: SetPieceOccupant) => (
    <WatchRosterToken occupant={occupant} combatant={byId.get(occupant.key)} />
  )

  return (
    <ZoneSetPiece
      view={view}
      partnerHighlighted={partnerHighlighted}
      onOpenRoster={onOpenRoster}
      handles={<FloatingEdgeHandles />}
      rim={<WatchExitStubs exits={exits} size={view.size} />}
      titleAccessory={
        enchantment ? (
          <span className="pointer-events-auto">
            <EnchantmentBadge enchantment={enchantment} />
          </span>
        ) : null
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
                    {cluster.map((o) => (
                      <div key={o.key}>{tokenChip(o)}</div>
                    ))}
                  </EngagedCluster>
                </li>
              ) : (
                <li key={cluster[0]!.key}>{tokenChip(cluster[0]!)}</li>
              )
            )}
          </ul>
        ) : undefined
      }
    />
  )
}
