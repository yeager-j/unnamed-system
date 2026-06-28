import { createReduceSession } from "./reduce-session"
import type { Session } from "./session"
import type { CombatEvent } from "./session-event"

/**
 * The pure **composition tier** over the session + spatial state (ADR §2.10; CD16,
 * Q6 → ship the literal wrapper). `EncounterState` pairs the combat {@link Session}
 * with the **opaque** Map-Instance state; the instance type is a parameter the
 * future spatial ADR substitutes its concrete `MapInstanceState` for — committing a
 * placeholder type now would be premature, and the wrapper reads no instance field
 * (CD16 "instance stays opaque").
 */
export interface EncounterState<Instance> {
  session: Session
  instance: Instance
}

/**
 * Builds the pure `reduceEncounter` root (ADR §2.10; CD16). Today it routes every
 * generic {@link CombatEvent} → the session reducer and **carries the instance
 * untouched**, preserving the same-ref no-op contract end-to-end: when the session
 * reducer returns the original reference, this returns the original `EncounterState`
 * reference (without the `===` guard, the `{ ...state, session }` spread would
 * always allocate a new object and break R24.1 propagation).
 *
 * This is the **designated root** for the cross-cutting composition the spatial ADR
 * fills in: the `mapInstanceId`-driven instance pairing (R24.5 — the session reducer
 * is `mapInstanceId`-blind; this root is its sole reader), the spatial-event arm
 * (`reduceMapInstance`), and the cross-row `guardMany` transactions (birth co-mint,
 * `addParticipant ↔ addOccupant`, `removeParticipant ↔ removeOccupant`-sever,
 * combat-end sweep + prune). None of those reducers/events exist in v2 yet, so 517
 * ships the combat arm + the seam; combat-end stays shell-composed (CD16 Q7).
 */
export function createReduceEncounter(newId: () => string) {
  const reduceSession = createReduceSession(newId)

  return <Instance>(
    state: EncounterState<Instance>,
    event: CombatEvent
  ): EncounterState<Instance> => {
    const session = reduceSession(state.session, event)
    return session === state.session ? state : { ...state, session }
  }
}
