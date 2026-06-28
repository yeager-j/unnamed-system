import type { Participant } from "./session"
import type { ParticipantSetup } from "./session-factory"

/**
 * Projects a runtime {@link Participant} back to the setup vocabulary (R1.5) — the
 * inverse of the mint, used to seed an editable roster from a persisted encounter.
 *
 * **Home-blind by design (the F1 kill).** v2's {@link ParticipantSource} carries no
 * storage discriminant — a participant's `source` is uniformly `{ entity }`,
 * whether it was a durable PC or an inline enemy. The durable-vs-inline **home** is
 * reconstructed from the **out-of-band locator map** (the shell re-pairs each setup
 * with its locator, ADR §2.1), never re-encoded here — so this stays a pure
 * projection over the participant with no `locator` argument to read. `hasActed`
 * inverts the mint's `turnsTakenThisRound = hasActed ? 1 : 0` (CD10).
 *
 * R1.5's **spatial half** (zoneId / engagement) is intentionally absent:
 * {@link ParticipantSetup} carries no spatial fields yet (the spatial setup
 * vocabulary is deferred to the spatial ADR).
 */
export function toParticipantSetup(participant: Participant): ParticipantSetup {
  return {
    id: participant.id,
    side: participant.overlay.allegiance.side,
    hasActed: participant.overlay.turnState.turnsTakenThisRound > 0,
    source: { entity: participant.entity },
  }
}
