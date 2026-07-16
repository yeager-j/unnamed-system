"use client"

import {
  EyeIcon,
  EyeSlashIcon,
  NoteIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr"
import { NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"

import type { MapZone } from "@workspace/game-v2/spatial"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

import { useDungeonCanvas } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/context"
import { FloatingEdgeHandles } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/floating-edge-handles"
import { OccupantToken } from "@/components/shared/canvas/set-piece/occupant-chips"
import { ZoneSetPiece } from "@/components/shared/canvas/set-piece/zone-set-piece"
import { exploreZoneView } from "@/domain/dungeon/view/set-piece-view"
import { type Pool } from "@/domain/pool"

export type DungeonZoneToken = {
  characterId: string
  name: string
  portraitUrl: string | null
  /** Current/max vitals for the token's health bars (UNN-489); absent ⇒ no bars. */
  hp?: Pool
  sp?: Pool
}
export type DungeonZoneData = {
  zone: MapZone
  revealed: boolean
  tokens: DungeonZoneToken[]
}
export type DungeonZoneNode = Node<DungeonZoneData, "dungeonZone">

/**
 * A Zone on the run console (UNN-464) — the play counterpart of the template
 * `ZoneNode`, now a thin wrapper over the shared {@link ZoneSetPiece} tiered card
 * (Dungeon Visual Overhaul §D3). It builds the zone's view from the occupancy
 * frame (party tokens; the DM console has no owned-gold) and hands the card its
 * Closeup roster; reveal state rides the card's visible glyph + `aria-describedby`,
 * never the name-only label. Selecting it reveals a {@link NodeToolbar} whose
 * actions (reveal/hide, Move party here, open the Zone details sheet) dispatch
 * through {@link useDungeonCanvas}.
 */
export function DungeonZoneNode({
  data,
  selected,
}: NodeProps<DungeonZoneNode>) {
  const { revealZone, hideZone, moveParty, openDetails, onInspect } =
    useDungeonCanvas()
  const { zone, revealed, tokens } = data
  const view = exploreZoneView({ zone, revealed, tokens })

  return (
    <ZoneSetPiece
      view={view}
      selected={selected}
      className="cursor-pointer"
      onOpenRoster={() => onInspect(zone.id)}
      handles={<FloatingEdgeHandles />}
      toolbar={
        <NodeToolbar
          isVisible={selected}
          position={Position.Top}
          className="flex items-center gap-1 rounded-none border bg-popover p-1 shadow-md"
        >
          <Button
            size="sm"
            variant={revealed ? "secondary" : "ghost"}
            aria-pressed={revealed}
            onClick={() => (revealed ? hideZone(zone.id) : revealZone(zone.id))}
          >
            {revealed ? <EyeIcon /> : <EyeSlashIcon />}
            {revealed ? "Revealed" : "Reveal to players"}
          </Button>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Button size="sm" variant="ghost" onClick={() => moveParty(zone.id)}>
            <UsersThreeIcon />
            Move party here
          </Button>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zone details"
            onClick={() => openDetails(zone.id)}
          >
            <NoteIcon />
          </Button>
        </NodeToolbar>
      }
      closeupRoster={
        view.occupants.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {view.occupants.map((occupant) => (
              <li key={occupant.key}>
                <OccupantToken occupant={occupant} />
              </li>
            ))}
          </ul>
        ) : undefined
      }
    />
  )
}
