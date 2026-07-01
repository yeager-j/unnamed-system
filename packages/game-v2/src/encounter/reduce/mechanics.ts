import { produce } from "immer"

import { getMechanic } from "@workspace/game-v2/mechanics/registry"

import type { Session } from "../session"
import type { MechanicTransitionEvent } from "../session-event"

/**
 * Mechanics slice (UNN-520) — the **ephemeral** arm of a mechanic-state write,
 * reached only via the write-router (its event is a
 * {@link MechanicTransitionEvent}, excluded from the generic wire like every
 * router-only arm). The durable arm is the existing per-row
 * `applyMechanicStateForCharacter` action — this slice is its session-blob twin.
 *
 * 1. **unknown participant id** → same-ref (Immer no-op).
 * 2. **capability-absence** → same-ref: a participant without a `Mechanics`
 *    component, or without a **recorded state** for the named mechanic, no-ops —
 *    presence = ownership (D3); the reducer never conjures an `initialState()`
 *    into the blob for a mechanic the participant doesn't carry.
 * 3. apply the validated transition descriptor through the mechanic's own
 *    registry {@link import("@workspace/game-v2/mechanics/definition").MechanicDefinition.transitions apply}
 *    — the Writer validated the descriptor pre-mint (CD19), so it is total here;
 *    a mechanic that ships no `transitions` surface no-ops.
 *
 * The stored state's `kind` matches its record key (the `mechanicsSchema` F6
 * refinement), so pairing it with `getMechanic(event.mechanic)`'s `apply` is
 * sound without a narrowing cast.
 */
export function reduceMechanicTransition(
  session: Session,
  event: MechanicTransitionEvent
): Session {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === event.participantId
    )
    if (participant === undefined) return

    const mechanics = participant.entity.components.mechanics
    const current = mechanics?.states[event.mechanic]
    if (mechanics === undefined || current === undefined) return

    const transitions = getMechanic(event.mechanic)?.transitions
    if (transitions === undefined) return

    mechanics.states[event.mechanic] = transitions.apply(
      current,
      event.transition
    )
  })
}
