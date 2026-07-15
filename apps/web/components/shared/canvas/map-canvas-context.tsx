"use client"

import { createContext, useContext, type ReactNode } from "react"

import type {
  ConnectionFlag,
  MapZoneMood,
  MapZoneMotif,
  MapZoneSize,
} from "@workspace/game-v2/spatial"

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
  /**
   * Zones that must not be deleted (the live-Instance host marks Zones an
   * occupancy token stands in). A {@link import("./zone-node").ZoneNode} in this set
   * disables its delete affordance — the DM relocates the party first (UNN-486).
   * Absent ⇒ nothing is locked (the Map-template editor).
   */
  lockedZoneIds?: ReadonlySet<string>
  /**
   * Optional per-Zone overlay rendered inside the Zone card — the live-Instance
   * host returns its party token chips so the DM can see occupancy while editing
   * geometry (UNN-486). The canvas stays geometry-only: it renders whatever node
   * the host returns without knowing what it is. Absent ⇒ no overlay.
   */
  renderZoneOverlay?: (zoneId: string) => ReactNode
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
