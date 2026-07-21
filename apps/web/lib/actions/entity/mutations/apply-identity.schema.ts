/**
 * The identity door's client-facing failure surface (UNN-675). Its own module
 * because a `"use server"` file may export only async functions, and the leaves
 * that bind the door need the type.
 *
 * There is deliberately no `"stale"`: the authority reads the version it guards
 * on, so a client token can neither be sent nor be wrong. Two lost races in one
 * request exhaust the executor's contention budget and surface as `"contention"`
 * — a transient condition the caller retries by editing again, not a conflict the
 * user must reconcile.
 */
export type ApplyIdentityWriteError =
  | "invalid-input"
  | "entity-not-found"
  | "contention"
