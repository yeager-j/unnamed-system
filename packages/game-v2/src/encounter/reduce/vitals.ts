import { produce } from "immer"

import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
} from "@workspace/game-v2/vitals/operations"

import type { Session } from "../session"
import type { ComponentWriteEvent } from "../session-event"

/**
 * Vitals slice (R12; **restructures** v1 `reduce/enemy-vitals.ts`, CD6) — the one
 * family the reducer reaches **only via the write-router** (its events are
 * {@link ComponentWriteEvent}s, excluded from the generic wire, CD19). v1's
 * absolute `adjustEnemyVitals` becomes signed-depletion deltas over a pool:
 *
 * 1. **unknown participant id** → same-ref (Immer no-op).
 * 2. **capability-absence** → same-ref: a participant lacking the targeted pool
 *    component (a no-`skillPool` enemy receiving an `sp` write) no-ops by
 *    component presence — reproducing v1's "SP ignored" with zero `kind` check.
 * 3. apply through the **existing total operations** — `damageParticipant` →
 *    {@link applyDamage} (signed, unclamped, over-max loan licensed) for HP /
 *    {@link applySpendSP} for SP; `healParticipant` → {@link applyHeal} (floors at
 *    0, no-ops over-max) / {@link applyRecoverSP}; `setParticipantMax` writes the
 *    component's `base` (effective max is **resolved**, so lowering base re-derives
 *    `currentHP` — no current-drags-max reconciliation, R12.2 eliminated).
 *
 * There is **no `vitalsHome` gate**: the router never dispatches a *durable*
 * vitals write as a session event (durable PC vitals go to the entity-row action),
 * so this slice is reached only for **ephemeral** vitals and applies over the
 * inline authored component unconditionally (CD18). **No floor on stored
 * `damage`/`spSpent`** — the floor lives in resolve + each operation's clamp.
 *
 * The pool branch is the single decision point (decided once, fanning to genuinely
 * different typed behavior): the HP and SP arms operate on different component
 * types through different operations, so they cannot collapse to one switch without
 * an unsound cast — the duplication is the honest shape, not a missing parameter.
 */
export function reduceVitals(
  session: Session,
  event: ComponentWriteEvent
): Session {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === event.participantId
    )
    if (participant === undefined) return

    const components = participant.entity.components

    if (event.pool === "hp") {
      const vitals = components.vitals
      if (vitals === undefined) return
      switch (event.kind) {
        case "damageParticipant":
          vitals.damage = applyDamage(vitals, event.amount).damage
          return
        case "healParticipant":
          vitals.damage = applyHeal(vitals, event.amount).damage
          return
        case "setParticipantMax":
          vitals.base = event.amount
          return
      }
    } else {
      const skillPool = components.skillPool
      if (skillPool === undefined) return
      switch (event.kind) {
        case "damageParticipant":
          skillPool.spSpent = applySpendSP(skillPool, event.amount).spSpent
          return
        case "healParticipant":
          skillPool.spSpent = applyRecoverSP(skillPool, event.amount).spSpent
          return
        case "setParticipantMax":
          skillPool.base = event.amount
          return
      }
    }
  })
}
