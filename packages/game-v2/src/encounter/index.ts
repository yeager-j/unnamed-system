/**
 * The `encounter` domain (UNN-515) — the pure data shapes the whole encounter
 * subsystem stands on: the {@link Session} container + {@link Participant}, the six
 * encounter-overlay components + {@link OVERLAY_KEYS}, the instance-lifecycle
 * shapes ({@link Position}/{@link Engagement}) + {@link INSTANCE_KEYS}, and the
 * mint {@link createSessionFactory}. The loader/assembly boundary (UNN-516) and the
 * pure reducer + `reduceEncounter` (UNN-517) build on these.
 */
export * from "./vocab"
export * from "./overlay"
export * from "./instance"
export * from "./session"
export * from "./session-factory"
export type { RegistryKeyInvariants } from "./disjointness"
