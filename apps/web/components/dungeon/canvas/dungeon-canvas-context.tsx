"use client"

import { createContext, useContext } from "react"

/**
 * The dispatchers the run-console's {@link import("./dungeon-zone-node").DungeonZoneNode}
 * toolbar calls, provided by the canvas root ({@link import("./dungeon-canvas").DungeonCanvas}).
 * A context rather than React Flow `data` callbacks (matching the editor's
 * {@link import("@/components/maps/canvas/map-canvas-context").MapCanvasProvider}):
 * it keeps the dispatchers off every node's `data` (which the canvas rebuilds from
 * the Instance on each change) and avoids prop-drilling through React Flow's render
 * path (CLAUDE.md).
 */
export interface DungeonCanvasContextValue {
  /** Reveals a Zone to players. */
  revealZone: (zoneId: string) => void
  /** Hides a Zone from players again. */
  hideZone: (zoneId: string) => void
  /** Moves every party token into this Zone (guides-not-blocks; same-Zone skips). */
  moveParty: (zoneId: string) => void
  /** Opens the Zone details sheet (description, DM notes, exits, reveal/unlock). */
  openDetails: (zoneId: string) => void
}

const DungeonCanvasContext = createContext<DungeonCanvasContextValue | null>(
  null
)

export const DungeonCanvasProvider = DungeonCanvasContext.Provider

export function useDungeonCanvas(): DungeonCanvasContextValue {
  const value = useContext(DungeonCanvasContext)
  if (!value) {
    throw new Error("useDungeonCanvas must be used within a <DungeonCanvas>")
  }
  return value
}
