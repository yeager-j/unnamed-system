"use client"

import { toast } from "sonner"

import { endOfTurnObligations } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import {
  dispatchCombatEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
import { useCombatantWrite } from "@/components/combat/console/use-combatant-write"
import { combatEnd } from "@/domain/combat/commit/protocol"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { useCombatPredictions } from "@/domain/combat/use-combat-predictions"
import { buildConsoleView } from "@/domain/combat/view/console-view"
import { buildRosterView } from "@/domain/combat/view/roster-view"
import { buildConsoleZoneLayout } from "@/domain/combat/view/zone-overview"
import { resolveSession } from "@/domain/game-engine-v2"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"

/**
 * The live DM console's owner-mode write surface. Every generic combat event,
 * component write, and end intent goes through the same predicted Headcanon
 * root, whose canon covers the encounter, Map Instance, optional dungeon, and
 * durable participant axes. The protocol owns optimistic prediction, retry,
 * reconciliation, and invalidation; this hook only translates UI gestures and
 * surfaces typed refusals.
 */
export function useCombatConsole(data: EncounterForDM) {
  const { encounter, participantMeta } = data
  const combatRoot = useCombatPredictions({ canon: data.canon })
  const state = combatRoot.value

  /**
   * Dispatches a run serially so each accepted mutation rebases the root before
   * the next prediction. This matters for reinforcement batches whose paired
   * encounter and Instance writes share the same axes.
   */
  async function dispatchSequence(events: ConsoleDispatchEvent[]) {
    for (const event of events) {
      const receipt = dispatchCombatEvent({
        event,
        encounterId: encounter.id,
        root: combatRoot,
      })
      if (!receipt) return
      const accepted = await receipt.accepted
      if (!accepted.ok) return
    }
  }

  function dispatch(event: ConsoleDispatchEvent) {
    void dispatchSequence([event])
  }

  const { dispatchWrite } = useCombatantWrite({
    encounterId: encounter.id,
    root: combatRoot,
  })

  /**
   * Ends the encounter through the intent-only combat protocol. The authority
   * serializes and stamps every changed row; acceptance refreshes the route into
   * its next lifecycle surface.
   */
  function endEncounter() {
    const result = combatRoot.mutate(combatEnd({ encounterId: encounter.id }))
    if (!result.ok) {
      toast.error(combatErrorMessage(result.error))
      return
    }
    void result.value.accepted.then((accepted) => {
      if (accepted.ok) return
      if (
        accepted.error.kind === "domain" ||
        accepted.error.kind === "replay-refused"
      ) {
        toast.error(combatErrorMessage(accepted.error.error))
      }
    })
  }

  // ── The derived combat view (UNN-467, rebuilt on v2 view builders) ────────
  // React Compiler memoizes these by their data deps — one resolveSession per
  // optimistic frame, every read below folding over the same resolved view.
  const resolved = resolveSession(state.session, state.mapInstance)
  const view = buildConsoleView(state.session, resolved)
  const { currentActor } = view
  const roster = buildRosterView(
    state.session,
    resolved,
    state.mapInstance,
    participantMeta
  )
  const zoneLayout = buildConsoleZoneLayout(state.mapInstance, resolved)
  const fallenPcNames = roster.players
    .filter((row) => row.isFallen)
    .map((row) => row.name)

  const obligations =
    currentActor !== null
      ? endOfTurnObligations(resolved, currentActor.id)
      : null

  return {
    session: state.session,
    instance: state.mapInstance,
    resolved,
    isPending: combatRoot.status.pending > 0,
    dispatch,
    dispatchSequence,
    dispatchWrite,
    endEncounter,
    // derived combat view
    view,
    currentActor,
    roster,
    zoneLayout,
    fallenPcNames,
    obligations,
    onDraft: (participantId: ParticipantId) =>
      dispatch({ kind: "draftCombatant", participantId }),
    onAdvanceRound: () => dispatch({ kind: "advanceRound" }),
  }
}
