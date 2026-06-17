"use client"

import { createContext, useContext } from "react"

import type { ConnectionFlag } from "./geometry-edits"

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
