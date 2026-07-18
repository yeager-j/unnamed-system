import { type Result } from "@workspace/result"

import { type WriteQueueTokenPort } from "./write-queue"

/**
 * One protocol pass for a **two-row** versioned write (UNN-589 D11) — the
 * cross-row sibling of {@link import("./write-queue").runVersionedWrite}:
 * dispatch at both tokens, fold both returned versions on success, and on a
 * `"stale"` refetch **both** versions in parallel, bump both forward, retry
 * once; a second `"stale"` is a real conflict and falls through to the caller
 * (as the single-row protocol does).
 *
 * Refetching both is deliberate: the guarded writes return an undifferentiated
 * `"stale"` whichever row's guard tripped, and threading a per-row discriminant
 * through every write wrapper, `guardMany` generic, and error union would buy
 * exactly one skipped single-integer SELECT on an already-failed path. If a
 * discriminant is ever wanted, the seam is `guardedVersionUpdate`'s
 * `notFound`-style error parameterization — noted, not built.
 *
 * Callers are responsible for serialization: enqueue this on the primary
 * (dungeon) lane and, inside it, on the secondary (instance) lane — the same
 * lock-order discipline the server's transactions follow (dungeon first,
 * always), which is what makes a two-row write unable to interleave with a
 * single-row write on either lane.
 */
export async function runDualVersionedWrite<
  TSuccess extends { version: number; instanceVersion: number },
  TError,
>(
  primary: WriteQueueTokenPort,
  secondary: WriteQueueTokenPort,
  refetchPrimary: (() => Promise<number | null>) | undefined,
  refetchSecondary: (() => Promise<number | null>) | undefined,
  action: (
    expectedVersion: number,
    expectedInstanceVersion: number
  ) => Promise<Result<TSuccess, TError>>
): Promise<Result<TSuccess, TError>> {
  const first = await action(primary.read(), secondary.read())
  if (first.ok) {
    primary.bump(first.value.version)
    secondary.bump(first.value.instanceVersion)
    return first
  }
  if (first.error !== "stale" || !refetchPrimary || !refetchSecondary) {
    return first
  }

  const [freshPrimary, freshSecondary] = await Promise.all([
    refetchPrimary(),
    refetchSecondary(),
  ])
  if (freshPrimary === null || freshSecondary === null) return first
  primary.bump(freshPrimary)
  secondary.bump(freshSecondary)

  const second = await action(primary.read(), secondary.read())
  if (second.ok) {
    primary.bump(second.value.version)
    secondary.bump(second.value.instanceVersion)
  }
  return second
}
