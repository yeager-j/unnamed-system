import { produce } from "immer"

import type { Session } from "../session"
import type { UseResourceEvent } from "../session-event"

/**
 * Resources slice (UNN-520) — the **ephemeral** arm of a consumable use, reached
 * only via the write-router (its event is a {@link UseResourceEvent}, excluded
 * from the generic wire). The durable arm is the existing per-row
 * `applyUsePrismaForCharacter` action — this slice is its session-blob twin.
 *
 * 1. **unknown participant id** → same-ref (Immer no-op).
 * 2. **capability-absence** → same-ref: a participant without a `Resources`
 *    component no-ops by presence.
 * 3. apply the total depletion increment. **No affordability check here**: the
 *    refusal at the resolved `maxPrisma` (`applyUsePrisma`) belongs to the
 *    Writer pre-mint, because the max is a resolved value the pure reducer must
 *    not derive — the minted event is total (the vitals slice's "no floor on
 *    stored depletion" doctrine, applied to charges).
 */
export function reduceUseResource(
  session: Session,
  event: UseResourceEvent
): Session {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === event.participantId
    )
    if (participant === undefined) return

    const resources = participant.entity.components.resources
    if (resources === undefined) return

    resources.prismaUsed += 1
  })
}
