"use client"

import { createContext, useContext } from "react"

/** The Play-mode dispatchers the canvas's custom nodes call, passed via context so
 *  they don't prop-drill through React Flow's render path (the pattern the template
 *  canvas uses for its edit dispatchers). */
export interface DungeonCanvasContextValue {
  /** Reveal (or hide) a Zone to players — confirm-gated at the call site. */
  toggleZoneReveal: (zoneId: string, revealed: boolean) => void
}

const DungeonCanvasContext = createContext<DungeonCanvasContextValue | null>(
  null
)

export function DungeonCanvasProvider({
  value,
  children,
}: {
  value: DungeonCanvasContextValue
  children: React.ReactNode
}) {
  return (
    <DungeonCanvasContext.Provider value={value}>
      {children}
    </DungeonCanvasContext.Provider>
  )
}

export function useDungeonCanvas(): DungeonCanvasContextValue {
  const value = useContext(DungeonCanvasContext)
  if (value === null) {
    throw new Error(
      "useDungeonCanvas must be used within a DungeonCanvasProvider"
    )
  }
  return value
}
