import { reduceActionEconomyEvent } from "./reduce/action-economy"
import { reduceAilmentEvent } from "./reduce/ailments"
import { reduceBattleConditionEvent } from "./reduce/conditions"
import { reduceDraftCombatantEvent } from "./reduce/draft"
import { reduceEnemyVitalsEvent } from "./reduce/enemy-vitals"
import { reduceOverrideEvent } from "./reduce/override"
import { reducePlacementEvent } from "./reduce/placement"
import { reduceRoundEvent } from "./reduce/round"
import { reduceTurnEvent } from "./reduce/turn"
import { reduceStartCombatEvent } from "./reduce/turn-start"
import { reduceZoneGraphEvent } from "./reduce/zones"
import type { CombatSession } from "./session"
import type { CombatEvent } from "./session-event"

export type { CombatEvent } from "./session-event"

/**
 * The pure tracker reducer: applies a {@link CombatEvent} to an immutable
 * {@link CombatSession}, returning the next session. It is a **decider** —
 * deterministic, no I/O, no mutation; the impure shell (`applyCombatEvent`,
 * UNN-332) persists the returned session. The character engine's counterpart is
 * {@link reduceCharacter}.
 *
 * Dispatch is a grouped `switch` over `event.kind` routing to per-domain slices
 * in `./reduce/`, mirroring `reduceCharacter`'s `routeEdit`. There is no
 * `default`: the switch is exhaustive over every {@link CombatEvent} kind, so a
 * new kind added to the union without a matching case fails to compile here
 * ("not all code paths return a value") until it is both handled in a slice and
 * routed — the compile-time guarantee that the event vocabulary and its dispatch
 * stay in lockstep. *Illegal* events (well-typed but a no-op against the current
 * state, e.g. `endTurn` with no current actor) are handled inside their slice.
 *
 * `newId` mints stable ids for combatants an `addCombatant` event joins (mirrors
 * `reduceCharacter`'s injectable id so tests can be deterministic); it defaults
 * to `crypto.randomUUID`, matching `createCombatSession`.
 */
export function reduceCombatSession(
  session: CombatSession,
  event: CombatEvent,
  newId: () => string = () => crypto.randomUUID()
): CombatSession {
  switch (event.kind) {
    case "endTurn":
      return reduceTurnEvent(session, event)

    case "startCombat":
      return reduceStartCombatEvent(session, event)

    case "draftCombatant":
      return reduceDraftCombatantEvent(session, event)

    case "advanceRound":
    case "addCombatant":
    case "removeCombatant":
      return reduceRoundEvent(session, event, newId)

    case "setBattleConditionAxis":
    case "setBattleConditionFlag":
    case "applyBattleConditionDuration":
      return reduceBattleConditionEvent(session, event)

    case "setAilment":
    case "clearAilment":
      return reduceAilmentEvent(session, event)

    case "setActionEconomy":
      return reduceActionEconomyEvent(session, event)

    case "adjustEnemyVitals":
      return reduceEnemyVitalsEvent(session, event)

    case "setCurrentActor":
    case "setActed":
    case "setRound":
      return reduceOverrideEvent(session, event)

    case "addZone":
    case "removeZone":
    case "setZoneAdjacency":
    case "renameZone":
      return reduceZoneGraphEvent(session, event, newId)

    case "moveCombatant":
      return reducePlacementEvent(session, event)
  }
}
