import {
  addParticipantPaired,
  removeParticipantPaired,
  type EncounterState,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

/**
 * The **one optimistic container** the DM console + encounter setup reduce
 * (UNN-535): a single `useOptimistic<EncounterState, ConsoleOptimisticAction>`
 * over `{ session, mapInstance }`, mirroring the command-owned roster
 * cross-writes that still need a joint session/map prediction:
 *
 * - `addPaired` / `removePaired` are mirrored through the
 *   engine's paired pure helpers so the roster slot and the occupancy token
 *   can't disagree (a zone-less `addPaired` mints no token — the add-then-place
 *   setup flow).
 * Combat-writable components are deliberately absent: their sole optimistic
 * and reconciliation authority is the relevant Replica projection (UNN-653).
 */
export type ConsoleOptimisticAction =
  | {
      kind: "addPaired"
      setup: { id: ParticipantId; side: CombatSide; entity: Entity }
      zoneId?: string
    }
  | { kind: "removePaired"; participantId: ParticipantId }

/**
 * Builds the console optimistic reducer around an injected id mint (tests pass
 * a deterministic one). The mint only fires for events that create ids the
 * client didn't supply — console gestures always client-mint, so in practice
 * it's a fallback.
 */
export function createReduceConsoleOptimistic(newId: () => string) {
  const addPaired = addParticipantPaired(newId)
  const removePaired = removeParticipantPaired(newId)

  return (
    state: EncounterState,
    action: ConsoleOptimisticAction
  ): EncounterState => {
    switch (action.kind) {
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
    }
  }
}

const clientNewId = () => crypto.randomUUID()

/** The production reducer the console + setup hand to `useOptimistic`. */
export const reduceConsoleOptimistic =
  createReduceConsoleOptimistic(clientNewId)
