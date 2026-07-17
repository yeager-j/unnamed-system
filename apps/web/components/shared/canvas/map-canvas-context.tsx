"use client"

import { createContext, useContext } from "react"

import type {
  ConnectionFlag,
  MapPage,
  MapZoneMood,
  MapZoneMotif,
  MapZoneSize,
} from "@workspace/game-v2/spatial"

import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

/**
 * A partial patch of a Zone's cosmetic identity fields (UNN-630). An **absent** key
 * means "leave it unchanged"; `motif: null` **clears** the motif. Mirrors the
 * `setZoneIdentity` geometry event's `identity` shape.
 */
export interface ZoneIdentityPatch {
  size?: MapZoneSize
  motif?: MapZoneMotif | null
  mood?: MapZoneMood
}

/**
 * The edit dispatchers the custom {@link import("./zone-node").ZoneNode} /
 * {@link import("./connection-edge").ConnectionEdge} and their floating toolbars
 * call, provided by the canvas root ({@link import("./map-canvas").MapCanvas}).
 * A context rather than React Flow `data` callbacks: it keeps the dispatchers off
 * every node's `data` (which we rewrite on each edit) and avoids prop-drilling
 * through React Flow's render path (CLAUDE.md).
 */
export interface MapCanvasContextValue {
  /** `"readonly"` (M3 player view) hides every editing affordance. */
  interactivity: "edit" | "readonly"
  /** Opens the Zone's details sheet (name / description / DM notes). */
  openZoneDetails: (zoneId: string) => void
  /** Patches a Zone's cosmetic identity (size / motif / mood; `motif: null` clears). */
  setZoneIdentity: (zoneId: string, identity: ZoneIdentityPatch) => void
  /** Clones a Zone (text only, no connections) offset from the original. */
  duplicateZone: (zoneId: string) => void
  /** Deletes a Zone (cascading its connections) after a confirm. */
  deleteZone: (zoneId: string) => void
  /** Sets one of a connection's independent `hidden`/`locked` flags. */
  setConnectionFlag: (
    connectionId: string,
    flag: ConnectionFlag,
    value: boolean
  ) => void
  /** Deletes a connection. */
  deleteConnection: (connectionId: string) => void
  /** The page the canvas is showing — nodes/edges are filtered to it (UNN-586). */
  activePageId: string
  /** Every page in canonical display order (`orderedPages`) — the "Move to
   *  page…" menu and the connect picker's group headings read it. */
  pages: MapPage[]
  /** Switches the canvas to `pageId`, optionally centering a Zone once there —
   *  the "leads to ⇢" chip's affordance. */
  navigateToPage: (pageId: string, focusZoneId?: string) => void
  /** Opens the searchable, page-grouped connect picker seeded from `zoneId` —
   *  the drag-free connector, and the only way to author a cross-page link. */
  openConnectPicker: (zoneId: string) => void
  /** Re-homes a Zone onto another page (position untouched). */
  moveZoneToPage: (zoneId: string, pageId: string) => void
  /**
   * Zones that must not be deleted (the live-Instance host marks Zones an
   * occupancy token stands in). A {@link import("./zone-node").ZoneNode} in this set
   * disables its delete affordance — the DM relocates the party first (UNN-486).
   * Absent ⇒ nothing is locked (the Map-template editor).
   */
  lockedZoneIds?: ReadonlySet<string>
  /**
   * Optional per-Zone occupants — the live-Instance host (run console Edit mode)
   * returns the party standing in each Zone so the tiered card reflects occupancy
   * at every zoom (pips / summary / roster), not just the Closeup overlay (UNN-486).
   * The canvas stays geometry-only otherwise; absent ⇒ every Zone reads empty (the
   * Map-template editor).
   */
  zoneOccupants?: (zoneId: string) => SetPieceOccupant[]
}

const MapCanvasContext = createContext<MapCanvasContextValue | null>(null)

export const MapCanvasProvider = MapCanvasContext.Provider

export function useMapCanvas(): MapCanvasContextValue {
  const value = useContext(MapCanvasContext)
  if (!value) {
    throw new Error("useMapCanvas must be used within a <MapCanvas>")
  }
  return value
}
