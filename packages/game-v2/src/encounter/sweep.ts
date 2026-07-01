import { deepEqual } from "@workspace/game-v2/kernel/deep-equal"

import { defaultOverlay } from "./overlay"
import type { Participant, Session } from "./session"

/**
 * The **end-of-combat overlay sweep** (ADR §2.8; CD1, CD16; R23.3's overlay half)
 * — clears every participant's combat-scoped overlay when the fight ends, leaving
 * durable components (`vitals.damage` on a row, exhaustion) and instance state
 * (Position/Engagement — pruned separately by the spatial `pruneCombat`) untouched.
 *
 * "Drop every overlay key" (the ADR's phrasing) is realized as a **wholesale
 * replacement with the fresh R1.1 default**: the overlay is one always-present
 * struct (CD1's simplicity revision), so there is no sparse bag to delete keys
 * from — swapping the entire struct for {@link defaultOverlay} IS the total sweep,
 * total by construction rather than by key-list iteration. (`OVERLAY_KEYS`
 * completeness — that the struct and the key-list agree — is proven at compile
 * time in {@link import("./disjointness")}.) The participant's `side` is the one
 * datum carried through: allegiance is roster composition decided at add-time,
 * and the fresh default needs it.
 *
 * Pure, with the standard no-op same-ref contract (R24.1): a participant whose
 * overlay is already fresh keeps its reference, and a session with nothing to
 * sweep is returned as-is.
 */
export function sweepOverlay(session: Session): Session {
  let changed = false
  const participants = session.participants.map((participant): Participant => {
    const fresh = defaultOverlay({
      side: participant.overlay.allegiance.side,
    })
    if (deepEqual(participant.overlay, fresh)) return participant
    changed = true
    return { ...participant, overlay: fresh }
  })

  return changed ? { ...session, participants } : session
}
