import { reduceActionEconomy } from "./reduce/action-economy"
import { reduceAilment } from "./reduce/ailments"
import { reduceBattleCondition } from "./reduce/conditions"
import { reduceCounter } from "./reduce/counters"
import { reduceDraft } from "./reduce/draft"
import { reduceOverride } from "./reduce/override"
import { reduceRoster } from "./reduce/roster"
import { reduceStartCombat } from "./reduce/start-combat"
import { reduceTurn } from "./reduce/turn"
import { reduceVitals } from "./reduce/vitals"
import type { Session } from "./session"
import type { SessionEvent } from "./session-event"

/**
 * The pure combat-**session** reducer (ADR §2.2; CD4) — applies a {@link
 * SessionEvent} to an immutable {@link Session}, returning the next session. It is
 * a **decider**: deterministic, no I/O, no mutation; the impure shell persists the
 * returned session. Each slice uses Immer `produce`, so every untouched path stays
 * **same-ref** and a documented no-op returns the original reference (R24.1).
 *
 * Dispatch is one **grouped exhaustive `switch` over `event.kind` with NO
 * `default`** (R24.2): a new kind added to {@link SessionEvent} without a matching
 * case fails to compile here ("not all code paths return a value") until it is
 * both handled in a slice and routed — the compile-time guarantee the event
 * vocabulary and its dispatch stay in lockstep. *Illegal* events (well-typed but a
 * no-op against the current state, e.g. `endTurn` with no actor) are handled inside
 * their slice. The reducer reads/writes the overlay + (for the vitals arms)
 * `participant.entity.components.{vitals,skillPool}`; it touches **no spatial
 * field** — `mapInstanceId`'s only reader is the `reduceEncounter` root (R24.5).
 *
 * Curried deps-first carried **no catalog dep** (CD4, SUPERSEDE R24.4): under
 * signed depletion the reducer never re-resolves a catalog max, so `getEnemy` is
 * dropped from the signature rather than kept as an empty seam. `newId` is injected
 * at the composition root (R24.3) and reaches only `reduceRoster`'s
 * `addParticipant` id fallback. The component-write (vitals) events arrive only via
 * the write-router; the generic wire (`combatEventSchema`) never yields one (CD19).
 */
export function createReduceSession(newId: () => string) {
  return (session: Session, event: SessionEvent): Session => {
    switch (event.kind) {
      case "startCombat":
        return reduceStartCombat(session, event)

      case "draftCombatant":
        return reduceDraft(session, event)

      case "endTurn":
        return reduceTurn(session)

      case "advanceRound":
      case "addParticipant":
      case "removeParticipant":
      case "setSide":
        return reduceRoster(session, event, newId)

      case "setCurrentActor":
      case "setActed":
      case "setRound":
        return reduceOverride(session, event)

      case "adjustBattleConditionAxis":
      case "setBattleConditionFlag":
        return reduceBattleCondition(session, event)

      case "setAilment":
      case "clearAilment":
        return reduceAilment(session, event)

      case "adjustCounter":
      case "clearCounter":
        return reduceCounter(session, event)

      case "adjustActionEconomy":
        return reduceActionEconomy(session, event)

      case "damageParticipant":
      case "healParticipant":
      case "setParticipantMax":
        return reduceVitals(session, event)
    }
  }
}
