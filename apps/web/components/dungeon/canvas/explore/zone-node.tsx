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

import { useDungeonCanvas } from "@/components/dungeon/canvas/explore/context"
import { DungeonTokenChip } from "@/components/dungeon/canvas/explore/token-chip"
import { ZoneCardFrame } from "@/components/dungeon/canvas/zone-card-frame"
import { type Pool } from "@/lib/combat/view/roster-view"

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
 * `ZoneNode`, built on the shared {@link ZoneCardFrame} so it matches the Setup
 * and combat boards: the Zone name, the occupant count, and the party tokens
 * rendered **inside** the card as side-tinted chips. Reveal state reads
 * **non-by-color** — an eye-slash glyph + a muted card when players can't see it
 * yet. Selecting it reveals a {@link NodeToolbar} whose actions (reveal/hide, Move
 * party here, open the Zone details sheet) dispatch through {@link useDungeonCanvas}.
 */
export function DungeonZoneNode({
  data,
  selected,
}: NodeProps<DungeonZoneNode>) {
  const { revealZone, hideZone, moveParty, openDetails } = useDungeonCanvas()
  const { zone, revealed, tokens } = data

  return (
    <ZoneCardFrame
      name={zone.name}
      revealed={revealed}
      count={tokens.length}
      ariaLabel={`Zone: ${zone.name}${revealed ? "" : " (hidden from players)"}`}
      selected={selected}
      className="cursor-pointer transition-shadow"
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
    >
      {tokens.map((token) => (
        <li key={token.characterId}>
          <DungeonTokenChip
            name={token.name}
            portraitUrl={token.portraitUrl}
            hp={token.hp}
            sp={token.sp}
          />
        </li>
      ))}
    </ZoneCardFrame>
  )
}
