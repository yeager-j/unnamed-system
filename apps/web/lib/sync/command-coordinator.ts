import { type Result } from "@workspace/result"

/** One managed replica's settlement barrier — `settleMutations` / `settleAll`
 *  shaped: resolves once every mutation issued before the call has a trusted
 *  terminal outcome. */
export type SettleBarrier = () => Promise<Result<void, "pending-write-failed">>

/**
 * The Showtime cross-root command coordinator (UNN-657) — the whole client
 * protocol for lifecycle and multi-root commands, replacing the classic
 * expected-version queue: settle the named replica barriers in order, refuse
 * cleanly on the first failure, then run the command Server Action exactly
 * once with semantic arguments.
 *
 * There is deliberately no client version token and no retry loop here. The
 * authority locks current rows in canonical order and validates semantic
 * preconditions in-transaction; an ambiguous delivery resolves through each
 * command's documented natural idempotency (desired-state lifecycle,
 * client-minted participant ids, absence-tolerant removes), never through an
 * automatic client retry. Lifecycle/expiry refusals come for free: a barrier
 * settles `err("pending-write-failed")` for a failed or expired pending
 * write, and the command's own typed refusals cover a lifecycle that changed
 * under it. Pending state and error copy stay with the caller — the consoles
 * already own `useTransition` and the toast maps.
 *
 * Precedent: the entity door's `runIdentityActionOnce` (settle → fresh
 * precondition → single attempt). This is the multi-replica generalization,
 * kept as one small function rather than a package abstraction (the ticket's
 * explicit boundary: no `settleMany` in `@workspace/replica` without a second
 * real consumer).
 */
export async function runCommand<T, E>(
  barriers: readonly SettleBarrier[],
  command: () => Promise<Result<T, E>>
): Promise<Result<T, E | "pending-write-failed">> {
  for (const settle of barriers) {
    const settled = await settle()
    if (!settled.ok) return settled
  }
  return command()
}
