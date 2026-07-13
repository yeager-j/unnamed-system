"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import type { SlotKind } from "@/domain/planner/slot-kind"

/** The runner's two faces: running the day, or the Day-End Capture ritual. */
export type RunnerMode = "run" | "day-end"

/**
 * The Day Runner's shared selection (handoff Screen 1 interactions): the
 * active slot and the selected character live above the roster sidebar and
 * the runner body — siblings in the page's layout — so a roster click can
 * select a character *and* jump to a downtime slot (the character card lives
 * there), and slot pills can switch the workspace. `mode` flips the body to
 * the **Day-End Capture** ritual view (UNN-580, D10: runner-owned, not a
 * route) — homed here, above the sidebar, so the roster can hide during the
 * ritual and the state survives the RSC refreshes every write triggers.
 * Plain client state; the day's facts stay server-fed props.
 */
interface RunnerSelection {
  /** Resolved to a concrete slot (falls back to the day's first slot). */
  activeSlotId: string | null
  selectedCharacterId: string | null
  mode: RunnerMode
  setActiveSlot: (slotId: string) => void
  selectCharacter: (characterId: string) => void
  setMode: (mode: RunnerMode) => void
}

const RunnerSelectionContext = createContext<RunnerSelection | null>(null)

export function RunnerSelectionProvider({
  slots,
  children,
}: {
  /** Today's slots in rail order, each with its derived kind. */
  slots: { id: string; kind: SlotKind }[]
  children: ReactNode
}) {
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  )
  const [mode, setMode] = useState<RunnerMode>("run")

  const effectiveSlotId = activeSlotId ?? slots[0]?.id ?? null
  const firstDowntimeSlotId =
    slots.find((slot) => slot.kind === "downtime")?.id ?? null

  return (
    <RunnerSelectionContext.Provider
      value={{
        activeSlotId: effectiveSlotId,
        selectedCharacterId,
        mode,
        setActiveSlot: setActiveSlotId,
        setMode,
        selectCharacter: (characterId) => {
          setSelectedCharacterId(characterId)
          setMode("run")
          // The mock's roster interaction: picking a character while a story
          // or dungeon slot is active jumps to a downtime slot, where the
          // character card lives.
          const active = slots.find((slot) => slot.id === effectiveSlotId)
          if (active?.kind !== "downtime" && firstDowntimeSlotId !== null) {
            setActiveSlotId(firstDowntimeSlotId)
          }
        },
      }}
    >
      {children}
    </RunnerSelectionContext.Provider>
  )
}

export function useRunnerSelection(): RunnerSelection {
  const context = useContext(RunnerSelectionContext)
  if (context === null) {
    throw new Error(
      "useRunnerSelection must be used within RunnerSelectionProvider"
    )
  }
  return context
}
