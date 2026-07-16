"use client"

import { type Node, type NodeProps } from "@xyflow/react"

import { FloatingEdgeHandles } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/floating-edge-handles"
import { EngagedCluster } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/engaged-cluster"
import { WatchRosterToken } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/roster-token"
import { useConnectionHighlight } from "@/components/shared/canvas/hovered-connection-context"
import { clustersOf } from "@/components/shared/canvas/set-piece/occupant-chips"
import { ThresholdNotch } from "@/components/shared/canvas/set-piece/threshold-notch"
import { ZoneSetPiece } from "@/components/shared/canvas/set-piece/zone-set-piece"
import { EnchantmentBadge } from "@/components/shared/enchantment-badge"
import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"
import { footprintOf, type ZoneSize } from "@/domain/map/view/footprints"
import type { ZoneSetPieceView } from "@/domain/map/view/set-piece-view"
import {
  notchAnchorOf,
  type ExitSide,
} from "@/domain/map/view/threshold-geometry"

export type WatchZoneExit = {
  /** The connection id (stable React key); the far Zone is undiscovered. */
  id: string
  locked: boolean
  /** The rim placement of the lone stub notch — loader-computed so it lands exactly
   *  where the revealed near-notch will (§D4). */
  side: ExitSide
  offset: number
}

/**
 * A revealed Zone's **known-exit stubs** — a lone notch opening into darkness on the
 * rim (UNN-633, §D4), the dissolution of the old `ExitChip` footer. Each renders at
 * its loader-computed `{side, offset}`, so when the far Zone reveals the paired edge's
 * near-notch lands in the same place. Rendered outside the tiered layers (the card's
 * `rim` slot), so exits show at every tier and are never clipped.
 */
export function WatchExitStubs({
  exits,
  size,
}: {
  exits: WatchZoneExit[]
  size?: ZoneSize
}) {
  const footprint = footprintOf(size)
  return (
    <>
      {exits.map((exit) => (
        <ThresholdNotch
          key={exit.id}
          anchor={notchAnchorOf(
            { side: exit.side, offset: exit.offset },
            { x: 0, y: 0 },
            footprint
          )}
          state={{ border: "unmapped", locked: exit.locked }}
          ariaLabel={exit.locked ? "Locked exit" : "Unexplored exit"}
        />
      ))}
    </>
  )
}
export type WatchZoneData = {
  view: ZoneSetPieceView
  exits: WatchZoneExit[]
  /** The Zone's active Bard Enchantment badge, when one sits here (UNN-489). */
  enchantment?: ZoneEnchantmentBadge
  /** Docks the watch roster inspector on this Zone (the crowded card's "Open
   *  roster ▸"; §D7). Supplied by the canvas, which owns the watch `inspectId`. */
  onOpenRoster: () => void
}
export type DungeonWatchZoneNode = Node<WatchZoneData, "fogZone">

/**
 * A revealed Zone on the **player fog view** (UNN-466) — a thin wrapper over the
 * shared {@link ZoneSetPiece} card (Dungeon Visual Overhaul §D3). It carries no
 * toolbar (players don't act on the map); it shows what the redacted snapshot
 * permits: the zone view (name, description, revealed party tokens — the viewer's
 * own gold), its Enchantment badge, and **lone stub notches** on the rim for each
 * known exit into darkness ({@link WatchExitStubs}). Tapping a token expands the
 * read-only stats popover. The hidden handles exist only so React Flow attaches the
 * revealed-connection threshold edges.
 */
export function DungeonWatchZoneNode({
  id,
  data,
}: NodeProps<DungeonWatchZoneNode>) {
  const { view, exits, enchantment, onOpenRoster } = data
  const partnerHighlighted = useConnectionHighlight(id)

  const tokenChip = (occupant: (typeof view.occupants)[number]) => (
    <WatchRosterToken occupant={occupant} />
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
    />
  )
}
