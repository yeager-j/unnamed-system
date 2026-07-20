"use client"

import { useState } from "react"

import type { ResolvedSession, Session } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import type { ConsoleDispatchEvent } from "@/components/combat/console/use-combat-console"
import { type ConsolePhase } from "@/components/combat/turn-order-strip"
import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import type { CombatantSheetSlice } from "@/domain/combat/sheet-slice"
import type { CurrentActorView } from "@/domain/combat/view/console-view"
import {
  combatantDetail,
  type CombatantDetail,
} from "@/domain/combat/view/detail-view"

/**
 * The console's **selection + end-of-turn UI state** (UNN-567), split out of
 * the headless write controller: which combatant the drawer shows, whether the
 * end-of-turn modal is open, and the {@link ConsolePhase} both derive from.
 * Both console shells (the mapless encounter, the dungeon combat canvas)
 * compose this beside {@link import("./use-combat-console").useCombatConsole},
 * which stays purely writes + derived combat view.
 *
 * `onEndTurn` is the one coupled gesture: dispatch the `endTurn` event into
 * the console *and* open the modal that resolves its obligations.
 */
export function useCombatSelection({
  session,
  resolved,
  instance,
  participantMeta,
  combatantSheetSliceById,
  currentActor,
  dispatch,
}: {
  session: Session
  resolved: ResolvedSession
  instance: MapInstanceState
  participantMeta: Record<ParticipantId, ParticipantMeta>
  combatantSheetSliceById: Record<ParticipantId, CombatantSheetSlice>
  currentActor: CurrentActorView | null
  dispatch: (event: ConsoleDispatchEvent) => void
}): {
  phase: ConsolePhase
  selectedDetail: CombatantDetail | null
  selectCombatant: (participantId: ParticipantId | null) => void
  endOfTurnOpen: boolean
  closeEndOfTurn: () => void
  onEndTurn: () => void
} {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCombatantId, setSelectedCombatantId] =
    useState<ParticipantId | null>(null)

  const phase: ConsolePhase =
    currentActor === null
      ? "drafting"
      : !currentActor.hasActed
        ? "active"
        : modalOpen
          ? "resolving"
          : "drafting"

  const selectedDetail =
    selectedCombatantId !== null
      ? combatantDetail(
          session,
          resolved,
          instance,
          selectedCombatantId,
          participantMeta[selectedCombatantId],
          combatantSheetSliceById[selectedCombatantId]
        )
      : null

  function onEndTurn() {
    dispatch({ kind: "endTurn" })
    setModalOpen(true)
  }

  return {
    phase,
    selectedDetail,
    selectCombatant: setSelectedCombatantId,
    endOfTurnOpen: modalOpen && phase === "resolving",
    closeEndOfTurn: () => setModalOpen(false),
    onEndTurn,
  }
}
