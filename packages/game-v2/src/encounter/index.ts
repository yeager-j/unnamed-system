/**
 * The `encounter` domain — the pure shapes + the loader boundary the whole
 * encounter subsystem stands on. UNN-515 ships the data shapes: the {@link Session}
 * container + {@link Participant}, the six encounter-overlay components +
 * {@link OVERLAY_KEYS}, the instance-lifecycle shapes ({@link Position}/{@link
 * Engagement}) + {@link INSTANCE_KEYS}, and the mint {@link createSessionFactory}.
 * UNN-516 ships the **one loader boundary**: the persisted {@link
 * StoredEntityLocator} contract, {@link loadSession}/{@link saveSession} (storage
 * dissolution + the out-of-band locator map), the {@link SpatialReads} port + the
 * Toccata effect injection, the three-home {@link assembleReadBag}, and the R1.5
 * {@link toParticipantSetup} inverse. The pure reducer + `reduceEncounter` (UNN-517)
 * build on these.
 */
export * from "./vocab"
export * from "./overlay"
export * from "./instance"
export * from "./session"
export * from "./session-factory"
export * from "./locator"
export * from "./spatial-reads"
export * from "./load-session"
export * from "./read-bag"
export * from "./to-setup"
export type { RegistryKeyInvariants } from "./disjointness"
