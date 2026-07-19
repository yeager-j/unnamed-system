import {
  toMechanicTransitionEvent,
  toSessionEvent,
  toUseResourceEvent,
  type SessionEvent,
} from "@workspace/game-v2/encounter/session-event"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"

/**
 * Translates a validated descriptor into the router-only reducer event — the
 * deep-path constructors' one call site (the import fence + barrel omission
 * keep it that way; this module lives inside `combat/commit/` so the fence's
 * exemption covers it). The single decision point from write vocabulary to
 * event vocabulary; its one caller is the combat replica's session processor
 * (UNN-646, after the classic session Store was deleted with its router).
 */
export function mintSessionEvent(
  participantId: ParticipantId,
  write: CombatEntityWrite
): SessionEvent {
  switch (write.component) {
    case "vitals":
    case "skillPool":
      return toSessionEvent({
        participantId,
        component: write.component,
        op: write.op,
        amount: write.amount,
      })
    case "resources":
      return toUseResourceEvent({ participantId, resource: "prisma" })
    case "mechanics":
      return toMechanicTransitionEvent({
        participantId,
        mechanic: write.mechanic,
        transition: write.transition,
      })
  }
}
