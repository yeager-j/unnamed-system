"use client"

import { createContext, useContext } from "react"

import type { CombatantView } from "@workspace/game/engine"

import type { ConsolePhase } from "@/components/combat/turn-order-strip"

/**
 * The combat-phase state + dispatchers the canvas-internal chrome reads — the
 * combat {@link import("./dungeon-combat-zone-node").DungeonCombatZoneNode} and the
 * turn-loop Panels ({@link import("./combat-turn-bar").CombatTurnBar} +
 * {@link import("./combat-spine-panel").CombatSpinePanel}). The combat peer of
 * {@link import("./dungeon-canvas-context").DungeonCanvasContextValue}: while a
 * fight runs on the delve, the run console swaps the play context for this one
 * (only one phase is mounted at a time), so the same `DungeonCanvas` shell renders
 * the battlefield without threading combat dispatchers through React Flow.
 */
export interface DungeonCombatCanvasContextValue {
  /** Combat round, for the bar's badge. */
  round: number
  /** Derived turn phase (drafting / active turn / resolving). */
  phase: ConsolePhase
  /** The drafting side's heading copy ("Players' draft", …). */
  draftHeading: string
  /** The acting combatant's name, or `null` while drafting. */
  actingName: string | null
  /** Turn-order rows for the {@link import("@/components/combat/turn-order-strip").TurnOrderStrip}. */
  turnRows: CombatantView[]
  /** Whether both sides are spent (the strip offers "start round N+1"). */
  roundComplete: boolean
  /** Draft an eligible combatant (start its turn). */
  onDraft: (combatantId: string) => void
  /** Advance to the next round (resets acted flags). */
  onAdvanceRound: () => void
  /** End the acting combatant's turn (flips the active side). */
  onEndTurn: () => void
  /** The acting combatant's id while its turn is active — badged on its token,
   *  and the subject of a click-to-move. `null` while drafting/resolving. */
  actingCombatantId: string | null
  /** The zone ids the acting combatant may move into — its adjacent zones, or
   *  every zone when {@link moveAnywhere} overrides (guided-but-overridable). */
  movableZoneIds: string[]
  /** Whether the move override is on (every zone is a legal target). */
  moveAnywhere: boolean
  /** Toggles the move override (guided adjacency ⇄ any zone). */
  onToggleMoveAnywhere: () => void
  /** Move the acting combatant into `toZoneId` (the `moveCombatant` event). */
  onMoveActing: (toZoneId: string) => void
  /** Open the per-combatant detail drawer. */
  onSelectCombatant: (combatantId: string) => void
  /** Enter the mid-fight add-combatant flow (tap-to-include a reinforcement). */
  onAddCombatant: () => void
  /** The read-only player combat view for this delve (`/c/dungeon/{shortId}`). */
  playerViewHref: string
  /** End the encounter (returns the console to exploration). */
  onEndEncounter: () => void
  /** Fallen PC names, for the end-combat confirm's warning. */
  fallenPcNames: string[]
  /** True while a write is in flight — disables the turn-loop controls. */
  disabled: boolean
}

const DungeonCombatCanvasContext =
  createContext<DungeonCombatCanvasContextValue | null>(null)

export const DungeonCombatCanvasProvider = DungeonCombatCanvasContext.Provider

export function useDungeonCombatCanvas(): DungeonCombatCanvasContextValue {
  const value = useContext(DungeonCombatCanvasContext)
  if (!value) {
    throw new Error(
      "useDungeonCombatCanvas must be used within a <DungeonCombatCanvasProvider>"
    )
  }
  return value
}
