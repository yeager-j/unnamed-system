/**
 * The `encounter` domain — the pure shapes + the loader boundary the whole
 * encounter subsystem stands on. UNN-515 ships the data shapes: the {@link Session}
 * container + {@link Participant}, the six encounter-overlay components +
 * {@link OVERLAY_KEYS}, the instance-lifecycle shapes ({@link Position} +
 * {@link INSTANCE_KEYS}; the dual-homed `Engagement` moved to
 * `kernel/vocab/engagement` in UNN-527), and the mint {@link createSessionFactory}.
 * UNN-516 ships the **one loader boundary**: the persisted {@link
 * StoredEntityLocator} contract, {@link loadSession}/{@link saveSession} (storage
 * dissolution + the out-of-band locator map), the {@link SpatialReads} port + the
 * Toccata effect injection, the three-home {@link assembleParticipantView}, and the R1.5
 * {@link toParticipantSetup} inverse. UNN-517 ships the **pure reducer**
 * ({@link createReduceSession} + its slices), the {@link createReduceEncounter}
 * composition root, and the event vocabulary — the generic {@link combatEventSchema}
 * wire (its `ComponentWrite` exclusion is the structural-ephemeral-only mechanism;
 * the router-only `toSessionEvent` constructor is deliberately **omitted** from this
 * barrel). UNN-518 ships the **derived turn-loop reads** that fold uniformly over
 * `resolve(participant.entity)` (zero `kind` branch): {@link compareInitiative},
 * {@link fallenParticipantIds}, {@link derivePartyComposition}, the drafting +
 * action-economy + name {@link import("./selectors") selectors}, and the
 * display-only {@link endOfTurnObligations} producers.
 */
export * from "./vocab"
export * from "./overlay"
export * from "./instance"
export * from "./session"
export * from "./session-factory"
export * from "./locator"
export * from "./spatial-reads"
export * from "./load-session"
export * from "./participant-view"
export * from "./to-setup"
export * from "./reduce-session"
export * from "./reduce-encounter"
export * from "./initiative"
export * from "./fallen"
export * from "./party-composition"
export * from "./selectors"
export * from "./end-of-turn"
export {
  combatEventSchema,
  BATTLE_CONDITION_AXIS_ACTIONS,
  ACTION_ECONOMY_ACTIONS,
  VITALS_POOLS,
  type StartCombatEvent,
  type DraftCombatantEvent,
  type EndTurnEvent,
  type AddParticipantSetup,
  type RosterEvent,
  type OverrideEvent,
  type BattleConditionEvent,
  type AilmentEvent,
  type CounterEvent,
  type ActionEconomyEvent,
  type CombatEvent,
  type ComponentWriteEvent,
  type SessionEvent,
  type BattleConditionAxisAction,
  type ActionEconomyAction,
  type VitalsPool,
} from "./session-event"
export type { RegistryKeyInvariants } from "./disjointness"
