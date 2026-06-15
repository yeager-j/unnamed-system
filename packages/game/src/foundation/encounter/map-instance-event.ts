import type {
  EnchantmentEvent,
  EngagementEvent,
  MoveCombatantEvent,
  ZoneGraphEvent,
} from "@workspace/game/foundation/encounter/session-event"

/**
 * The spatial event vocabulary {@link import("@workspace/game/engine") reduceMapInstance}
 * dispatches over — the subset of {@link import("./session-event").CombatEvent} that
 * mutates spatial state once it lives on the {@link import("./map-instance").MapInstanceState}:
 * the zone graph, token occupancy, engagement, and the Zone Enchantment.
 *
 * Additive (UNN-454): the member events still live in `session-event.ts` and stay
 * in `CombatEvent` — this only *names the subset* so the Instance reducer and the
 * version guards (UNN-456) can refer to it. The M0 cutover (UNN-459) is where the
 * `CombatEvent` union is actually split and these event *definitions* migrate here,
 * leaving the session reducer with the non-spatial events.
 *
 * Reveal/hide/unlock are deliberately absent — they arrive with reveal-state in
 * M1/M2 (UNN-461 / UNN-464), per the lean M0 shape.
 */
export type MapInstanceEvent =
  | ZoneGraphEvent
  | MoveCombatantEvent
  | EngagementEvent
  | EnchantmentEvent
