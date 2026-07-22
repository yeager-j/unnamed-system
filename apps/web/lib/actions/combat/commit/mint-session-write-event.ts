import {
  toMechanicTransitionEvent,
  toSessionEvent,
  toUseResourceEvent,
  type SessionEvent,
} from "@workspace/game-v2/encounter/session-event"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"

/** The single translation from combat component intent to reducer event. */
export function mintSessionWriteEvent(
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
