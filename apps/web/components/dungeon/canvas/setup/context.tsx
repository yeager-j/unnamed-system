"use client"

import { createContext, useContext } from "react"

/**
 * The encounter **Setup** phase's canvas state + dispatchers (UNN-467) — the
 * spatially-scoped combatant picker. While staging a fight the run console swaps
 * in this context: the canvas shows the delve's PC tokens with an inclusion tick
 * (out-of-roster tokens dimmed), and tapping one toggles it in/out of the fight
 * (the panel-row peer of the same toggle). Ephemeral — nothing here is persisted
 * until "Begin".
 */
export interface DungeonSetupCanvasContextValue {
  /** Whether a PC (by `characterId`) is in the staged fight — drives the tick. */
  isIncluded: (characterId: string) => boolean
  /** Toggle a PC in/out of the staged fight. */
  onTogglePc: (characterId: string) => void
  /** Enemy count — the "Begin (N)" gate. */
  beginCount: number
  /** Whether Begin is allowed (≥1 enemy, all placed). */
  canBegin: boolean
  /** Opens the advantage / first-side dialog, then starts combat. */
  onBegin: () => void
  /** Cancels Setup, returning to exploration with no state change. */
  onCancel: () => void
  /** True while the start-combat write is in flight. */
  disabled: boolean
}

const DungeonSetupCanvasContext =
  createContext<DungeonSetupCanvasContextValue | null>(null)

export const DungeonSetupCanvasProvider = DungeonSetupCanvasContext.Provider

export function useDungeonSetupCanvas(): DungeonSetupCanvasContextValue {
  const value = useContext(DungeonSetupCanvasContext)
  if (!value) {
    throw new Error(
      "useDungeonSetupCanvas must be used within a <DungeonSetupCanvasProvider>"
    )
  }
  return value
}
