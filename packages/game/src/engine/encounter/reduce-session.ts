import { reduceActionEconomyEvent } from "@workspace/game/engine/encounter/reduce/action-economy"
import { reduceAilmentEvent } from "@workspace/game/engine/encounter/reduce/ailments"
import { reduceBattleConditionEvent } from "@workspace/game/engine/encounter/reduce/conditions"
import { reduceCounterEvent } from "@workspace/game/engine/encounter/reduce/counters"
import { reduceDraftCombatantEvent } from "@workspace/game/engine/encounter/reduce/draft"
import { reduceEnemyVitalsEvent } from "@workspace/game/engine/encounter/reduce/enemy-vitals"
import { reduceEngagementEvent } from "@workspace/game/engine/encounter/reduce/engagement"
import { reduceOverrideEvent } from "@workspace/game/engine/encounter/reduce/override"
import { reducePlacementEvent } from "@workspace/game/engine/encounter/reduce/placement"
import { reduceRoundEvent } from "@workspace/game/engine/encounter/reduce/round"
import { reduceTurnEvent } from "@workspace/game/engine/encounter/reduce/turn"
import { reduceStartCombatEvent } from "@workspace/game/engine/encounter/reduce/turn-start"
import { reduceZoneGraphEvent } from "@workspace/game/engine/encounter/reduce/zones"
import { type EnemyLookup } from "@workspace/game/engine/ports"
import type { CombatSession } from "@workspace/game/foundation/encounter/session"
import type { CombatEvent } from "@workspace/game/foundation/encounter/session-event"

export type { CombatEvent } from "@workspace/game/foundation/encounter/session-event"

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
 * `reduceCharacter`'s injectable id so tests can be deterministic); it is bound
 * at the composition root ({@link createGameEngine}) so the engine core carries
 * no default seam.
 */
export function reduceCombatSession(
  session: CombatSession,
  event: CombatEvent,
  lookups: Pick<EnemyLookup, "getEnemy">,
  newId: () => string
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

    case "adjustBattleConditionAxis":
    case "setBattleConditionFlag":
      return reduceBattleConditionEvent(session, event)

    case "setAilment":
    case "clearAilment":
      return reduceAilmentEvent(session, event)

    case "adjustCounter":
    case "clearCounter":
      return reduceCounterEvent(session, event)

    case "setActionEconomy":
      return reduceActionEconomyEvent(session, event)

    case "adjustEnemyVitals":
      return reduceEnemyVitalsEvent(session, event, lookups)

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

    case "setEngagement":
    case "clearEngagement":
      return reduceEngagementEvent(session, event)
  }
}
