"use client"

import { type Node, type NodeProps } from "@xyflow/react"

import type { MapZone } from "@workspace/game/foundation"

import {
  DungeonSetupTokenChip,
  type DungeonSetupZoneToken,
} from "./dungeon-setup-token-chip"
import { ZoneCardFrame } from "./zone-card-frame"

export type DungeonSetupZoneData = {
  zone: MapZone
  revealed: boolean
  tokens: DungeonSetupZoneToken[]
}
export type DungeonSetupZoneNode = Node<
  DungeonSetupZoneData,
  "dungeonSetupZone"
>

/**
 * A Zone on the encounter **Setup** board (UNN-467) — read-only geography on the
 * shared {@link ZoneCardFrame} whose tokens are {@link DungeonSetupTokenChip}s: PC
 * tokens carry an inclusion tick and toggle in/out of the staged fight on tap;
 * staged enemies show as planned arrivals. No movement or reveal here — Setup only
 * picks who fights, so the frame's hidden-from-players glyph is suppressed.
 */
export function DungeonSetupZoneNode({
  data,
}: NodeProps<DungeonSetupZoneNode>) {
  const { zone, revealed, tokens } = data

  return (
    <ZoneCardFrame
      name={zone.name}
      revealed={revealed}
      count={tokens.length}
      ariaLabel={`Zone: ${zone.name}`}
      showHiddenGlyph={false}
    >
      {tokens.map((token) => (
        <li key={token.id}>
          <DungeonSetupTokenChip token={token} />
        </li>
      ))}
    </ZoneCardFrame>
  )
}
