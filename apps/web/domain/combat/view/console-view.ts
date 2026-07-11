import {
  eligibleParticipants,
  fallenParticipantIds,
  nextDraftingSide,
  participantDisplayNames,
  type ResolvedSession,
  type Session,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

/**
 * The display projection the live DM console's turn-order spine renders — the
 * v2 successor of v1's `engine/encounter/console-view.ts`, now a pure fold over
 * the {@link ResolvedSession} (names, Fallen, and eligibility all read off the
 * resolved view; no injected PC map, no per-kind name switch). Recomputed on
 * every optimistic frame, so a draft / revive / end-turn reflects with no extra
 * state.
 *
 * Only **Fallen** participants are excluded from drafting (rulebook 3.2); a
 * Downed one stays draft-eligible on purpose — the reducer clears Downed on
 * draft, so excluding it would make recovery unreachable.
 */

/** One participant as the turn-order strip renders it. */
export interface CombatantView {
  id: ParticipantId
  name: string
  side: CombatSide
  hasActed: boolean
  isCurrent: boolean
  isFallen: boolean
  isEligible: boolean
}

/** The current actor as the header renders it, or `null` between turns. */
export interface CurrentActorView {
  id: ParticipantId
  name: string
  side: CombatSide
  hasActed: boolean
}

export interface ConsoleView {
  rows: CombatantView[]
  currentActor: CurrentActorView | null
  draftingSide: CombatSide
  /** No participant remains to draft this round — the caller offers
   *  "Start round N+1" (`advanceRound`). */
  roundComplete: boolean
}

/** Builds the {@link ConsoleView} for one (optimistic) frame. */
export function buildConsoleView(
  session: Session,
  view: ResolvedSession
): ConsoleView {
  const fallenIds = fallenParticipantIds(view)
  const eligibleIds = new Set(
    eligibleParticipants(session, fallenIds).map((p) => p.id)
  )
  const nameById = participantDisplayNames(view)

  const rows: CombatantView[] = session.participants.map((participant) => ({
    id: participant.id,
    name: nameById.get(participant.id) ?? participant.id,
    side: participant.overlay.allegiance.side,
    hasActed: participant.overlay.turnState.turnsTakenThisRound > 0,
    isCurrent: participant.id === session.currentActorId,
    isFallen: fallenIds.has(participant.id),
    isEligible: eligibleIds.has(participant.id),
  }))

  const actor = rows.find((row) => row.id === session.currentActorId) ?? null

  return {
    rows,
    currentActor: actor
      ? {
          id: actor.id,
          name: actor.name,
          side: actor.side,
          hasActed: actor.hasActed,
        }
      : null,
    draftingSide: nextDraftingSide(session, fallenIds),
    roundComplete: eligibleIds.size === 0,
  }
}
