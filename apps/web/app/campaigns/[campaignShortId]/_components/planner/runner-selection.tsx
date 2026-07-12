"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import type { SlotKind } from "@/domain/planner/slot-kind"

/**
 * The Day Runner's shared selection (handoff Screen 1 interactions): the
 * active slot and the selected character live above the roster sidebar and
 * the runner body — siblings in the page's layout — so a roster click can
 * select a character *and* jump to a downtime slot (the character card lives
 * there), and slot pills can switch the workspace. Plain client state; the
 * day's facts stay server-fed props.
 */
interface RunnerSelection {
  /** Resolved to a concrete slot (falls back to the day's first slot). */
  activeSlotId: string | null
  selectedCharacterId: string | null
  setActiveSlot: (slotId: string) => void
  selectCharacter: (characterId: string) => void
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

  const effectiveSlotId = activeSlotId ?? slots[0]?.id ?? null
  const firstDowntimeSlotId =
    slots.find((slot) => slot.kind === "downtime")?.id ?? null

  return (
    <RunnerSelectionContext.Provider
      value={{
        activeSlotId: effectiveSlotId,
        selectedCharacterId,
        setActiveSlot: setActiveSlotId,
        selectCharacter: (characterId) => {
          setSelectedCharacterId(characterId)
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
