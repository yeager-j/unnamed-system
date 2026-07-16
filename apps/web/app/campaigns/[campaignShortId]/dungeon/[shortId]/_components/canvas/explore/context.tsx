"use client"

import { createContext, useContext } from "react"

import type { DungeonConsoleMode } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/mode-toggle"

/**
 * The run-console state + dispatchers the canvas-internal chrome reads — the
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/zone-node").DungeonZoneNode} toolbar and the
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/turn-loop-bar").TurnLoopBar} (a React Flow `Panel`, so it can
 * own the zoom controls). **Provided by the run console**
 * ({@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/run-console").DungeonRunConsole}), above
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/canvas").DungeonCanvas} — a context rather than props so
 * neither the turn loop nor the zone dispatchers thread through `DungeonCanvas` and
 * React Flow's render path to reach the nodes/panels (matching the editor's
 * {@link import("@/components/shared/canvas/map-canvas-context").MapCanvasProvider}).
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
  /** Docks the roster inspector on this Zone — the crowded card's "Open roster ▸"
   *  made explicit (mutually exclusive with the details sheet). */
  onInspect: (zoneId: string) => void
  /** The current dungeon-turn counter (the bar's read-out). */
  turnCounter: number
  /** Advances the dungeon turn. */
  advanceTurn: () => void
  /** Ends the delve (`active → done`) after a confirm. */
  finishDelve: () => void
  /** Opens the pre-combat staging dialog to begin an encounter (UNN-536). */
  onStartEncounter: () => void
  /** The current Edit ⇄ Play mode (the bar's toggle read-out). */
  mode: DungeonConsoleMode
  /** Switches between Play (tokens/fog) and Edit (the Map builder). */
  onModeChange: (mode: DungeonConsoleMode) => void
  /** True while a write is in flight — disables the turn-loop controls. */
  disabled: boolean
}

const DungeonCanvasContext = createContext<DungeonCanvasContextValue | null>(
  null
)

export const DungeonCanvasProvider = DungeonCanvasContext.Provider

export function useDungeonCanvas(): DungeonCanvasContextValue {
  const value = useContext(DungeonCanvasContext)
  if (!value) {
    throw new Error(
      "useDungeonCanvas must be used within a <DungeonCanvasProvider>"
    )
  }
  return value
}
