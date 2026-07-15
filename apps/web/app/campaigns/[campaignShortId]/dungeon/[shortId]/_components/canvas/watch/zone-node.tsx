"use client"

import { type Node, type NodeProps } from "@xyflow/react"

import { FloatingEdgeHandles } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/floating-edge-handles"
import { EngagedCluster } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/engaged-cluster"
import { ExitChip } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/exit-chip"
import { TokenStatsPopover } from "@/components/combat/token-stats-popover"
import {
  clustersOf,
  OccupantToken,
} from "@/components/shared/canvas/set-piece/occupant-chips"
import { ZoneSetPiece } from "@/components/shared/canvas/set-piece/zone-set-piece"
import { EnchantmentBadge } from "@/components/shared/enchantment-badge"
import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"
import type { ZoneSetPieceView } from "@/domain/map/view/set-piece-view"

export type WatchZoneExit = {
  /** The connection id (stable React key); the far Zone is undiscovered. */
  id: string
  locked: boolean
}
export type WatchZoneData = {
  view: ZoneSetPieceView
  exits: WatchZoneExit[]
  /** The Zone's active Bard Enchantment badge, when one sits here (UNN-489). */
  enchantment?: ZoneEnchantmentBadge
}
export type DungeonWatchZoneNode = Node<WatchZoneData, "fogZone">

/**
 * A revealed Zone on the **player fog view** (UNN-466) — a thin wrapper over the
 * shared {@link ZoneSetPiece} card (Dungeon Visual Overhaul §D3). It carries no
 * toolbar (players don't act on the map); it shows what the redacted snapshot
 * permits: the zone view (name, description, revealed party tokens — the viewer's
 * own gold), its Enchantment badge, and a footer of **known-exit silhouettes**.
 * Tapping a token expands the read-only {@link TokenStatsPopover}. The hidden
 * handles exist only so React Flow attaches the revealed-connection floating edges.
 */
export function DungeonWatchZoneNode({
  data,
}: NodeProps<DungeonWatchZoneNode>) {
  const { view, exits, enchantment } = data

  const tokenChip = (occupant: (typeof view.occupants)[number]) => (
    <TokenStatsPopover
      name={occupant.name}
      hp={occupant.hp ?? null}
      sp={occupant.sp ?? null}
    >
      <OccupantToken occupant={occupant} />
    </TokenStatsPopover>
  )

  return (
    <ZoneSetPiece
      view={view}
      handles={<FloatingEdgeHandles />}
      titleAccessory={
        enchantment ? (
          // React Flow sets `pointer-events: none` on this read-only fog node,
          // which would swallow the badge's hover and kill its tooltip.
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
      closeupFooter={
        exits.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {exits.map((exit) => (
              <li key={exit.id}>
                <ExitChip locked={exit.locked} />
              </li>
            ))}
          </ul>
        ) : undefined
      }
    />
  )
}
