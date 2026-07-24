"use client"

import { createContext, useContext } from "react"

import type { DungeonConsoleMode } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/mode-toggle"
import type { ZoneSetPieceHop } from "@/domain/map/view/set-piece-view"

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
  /** The range-lens badge for a Zone (§D5), or `null` when it's unreachable from
   *  the party's zones (the lens origin — selection never re-homes it). */
  hopFor: (zoneId: string) => ZoneSetPieceHop | null
  /** Whether the party occupies this Zone — the gold keyline channel (§D6). */
  isParty: (zoneId: string) => boolean
  /** The current dungeon-turn counter (the bar's read-out). */
  turnCounter: number
  /** Advances the dungeon turn. */
  advanceTurn: () => void
  /** Ends the delve (`active → done`) after a confirm. */
  finishDelve: () => void
  /** True for a Region expedition (UNN-589) — the bar's finish confirm names
   *  the variant ("expedition" folds the Region's chart; a "delve" just ends). */
  isExpedition: boolean
  /** Opens the pre-combat staging dialog to begin an encounter (UNN-536). */
  onStartEncounter: () => void
  /** The current Edit ⇄ Play mode (the bar's toggle read-out). */
  mode: DungeonConsoleMode
  /** Switches between Play (tokens/fog) and Edit (the Map builder). */
  onModeChange: (mode: DungeonConsoleMode) => void
  /** True while a write is in flight — disables the turn-loop controls. */
  disabled: boolean
  /** Switches the board to another page, optionally centering a Zone once there —
   *  the cross-page chip's affordance (UNN-586). */
  navigateToPage: (pageId: string, focusZoneId?: string) => void
  /** Expands a generation stub — the one non-optimistic spatial write (UNN-642,
   *  D8 seam 2). The ghost spins via {@link isStubPending} until the refetched
   *  canon paints the outcome. */
  expandStub: (stubId: string) => void
  /** Force-picks a template for the stub (context menu; same server path). */
  forcePickStub: (stubId: string, templateKey: string) => void
  /** Declares and immediately force-places a site on this exact stub. */
  forcePlaceStub: (stubId: string, templateKey: string) => void
  /** Queues a site for the next qualifying expansion at or below a depth. */
  queueForcePlace: (templateKey: string, minDepth: number) => void
  /** Whether any frontier stub remains to receive a queued site. */
  canQueueSite: boolean
  /** Retracts a generated leaf Zone back to its stub (context-menu-only, D8). */
  retractZone: (zoneId: string) => void
  /** True while this stub's expand round-trip is in flight. */
  isStubPending: (stubId: string) => boolean
  /** The force-pick menu's template list (non-tombstoned, name-sorted);
   *  empty on ordinary delves, which have no ghosts anyway. */
  expandTemplates: ReadonlyArray<{
    key: string
    name: string
    disabled: boolean
  }>
  /** Declarable Region sites with only public status needed by the menus. */
  siteTemplates: ReadonlyArray<{
    key: string
    name: string
    defaultMinDepth: number
    spent: boolean
    pending: boolean
  }>
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
