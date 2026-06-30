import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"
import { zoneOf } from "@workspace/game-v2/spatial/selectors"

import type { Session } from "./session"

/**
 * The **D28#2 allegiance-gated engagement-candidate selector** — the combatants a
 * participant may newly engage: every combatant on the **opposing side** standing in
 * the **same zone**. It lives at the **composition tier** (spatial ADR §2.5/§2.8;
 * SD7), never in the spatial reducer: `Allegiance` is encounter *overlay* and spatial
 * stands alone with none, so this reads the session's allegiance + spatial's {@link
 * zoneOf} with allegiance **injected** — putting it in the spatial reducer would force
 * a spatial → combat read and break SD2.
 *
 * v1 surfaced *every* in-zone combatant; v2 gates to the opposing side (the deliberate
 * SUPERSEDE). An **unplaced / mapless** actor (`zoneOf → undefined`) has no candidates
 * — engagement is a same-zone melee lock, so there is nowhere to engage from. The
 * actor itself is never a candidate.
 */
export function engagementCandidates(
  session: Session,
  mapInstance: MapInstanceState,
  participantId: ParticipantId
): ParticipantId[] {
  const actor = session.participants.find((p) => p.id === participantId)
  if (actor === undefined) return []

  const actorZone = zoneOf(mapInstance, participantId)
  if (actorZone === undefined) return []

  const actorSide = actor.overlay.allegiance.side

  return session.participants
    .filter(
      (other) =>
        other.id !== participantId &&
        other.overlay.allegiance.side !== actorSide &&
        zoneOf(mapInstance, other.id) === actorZone
    )
    .map((other) => other.id)
}
