import {
  addParticipantPaired,
  createReduceEncounter,
  removeParticipantPaired,
  type EncounterEvent,
  type EncounterState,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import type { CombatEntityWrite } from "@/lib/entity/commit/write.schema"
import { applyEntityWrite, type WriterDeps } from "@/lib/entity/commit/writers"

/**
 * The **one optimistic container** the DM console + encounter setup reduce
 * (UNN-535): a single `useOptimistic<EncounterState, ConsoleOptimisticAction>`
 * over `{ session, mapInstance }`, mirroring exactly what the server actions
 * persist. Four arms:
 *
 * - `event` — any generic wire / spatial event, routed through the engine's own
 *   {@link createReduceEncounter} composition root (the same reducer the server
 *   runs, so the optimistic frame is structurally identical to the persisted
 *   result).
 * - `addPaired` / `removePaired` — the roster cross-writes, mirrored through the
 *   engine's paired pure helpers so the roster slot and the occupancy token
 *   can't disagree (a zone-less `addPaired` mints no token — the add-then-place
 *   setup flow).
 * - `write` — one entity component write, predicted by the Writers'
 *   {@link applyEntityWrite} **against the participant found in the current
 *   frame**. This is the structural UNN-226 fix: the action carries the write
 *   *descriptor*, never a post-state composed in a click handler's closure — so
 *   two back-to-back damage writes each apply to the frame the previous one
 *   produced and correctly **sum** instead of the second silently overwriting
 *   the first. A Writer refusal returns the state unchanged (the dispatch layer
 *   pre-checks and toasts; the reducer stays total).
 */
export type ConsoleOptimisticAction =
  | { kind: "event"; event: EncounterEvent }
  | {
      kind: "addPaired"
      setup: { id: ParticipantId; side: CombatSide; entity: Entity }
      zoneId?: string
    }
  | { kind: "removePaired"; participantId: ParticipantId }
  | {
      kind: "write"
      participantId: ParticipantId
      write: CombatEntityWrite
      deps: WriterDeps
    }

/**
 * Builds the console optimistic reducer around an injected id mint (tests pass
 * a deterministic one). The mint only fires for events that create ids the
 * client didn't supply — console gestures always client-mint, so in practice
 * it's a fallback.
 */
export function createReduceConsoleOptimistic(newId: () => string) {
  const reduceEncounter = createReduceEncounter(newId)
  const addPaired = addParticipantPaired(newId)
  const removePaired = removeParticipantPaired(newId)

  return (
    state: EncounterState,
    action: ConsoleOptimisticAction
  ): EncounterState => {
    switch (action.kind) {
      case "event":
        return reduceEncounter(state, action.event)
      case "addPaired":
        return addPaired(
          state,
          { kind: "addParticipant", setup: action.setup },
          action.zoneId
        )
      case "removePaired":
        return removePaired(state, {
          kind: "removeParticipant",
          participantId: action.participantId,
        })
      case "write":
        return applyWriteToFrame(state, action)
    }
  }
}

/** Predicts one component write against the participant in the current frame —
 *  merged immutably into that participant's `entity.components`; a refusal (or
 *  an unknown participant) leaves the state untouched. */
function applyWriteToFrame(
  state: EncounterState,
  action: Extract<ConsoleOptimisticAction, { kind: "write" }>
): EncounterState {
  const index = state.session.participants.findIndex(
    (participant) => participant.id === action.participantId
  )
  const participant = state.session.participants[index]
  if (participant === undefined) return state

  const predicted = applyEntityWrite(
    participant.entity.components,
    action.write,
    action.deps
  )
  if (!predicted.ok) return state

  const participants = [...state.session.participants]
  participants[index] = {
    ...participant,
    entity: {
      ...participant.entity,
      components: { ...participant.entity.components, ...predicted.value },
    },
  }
  return { ...state, session: { ...state.session, participants } }
}

const clientNewId = () => crypto.randomUUID()

/** The production reducer the console + setup hand to `useOptimistic`. */
export const reduceConsoleOptimistic =
  createReduceConsoleOptimistic(clientNewId)
