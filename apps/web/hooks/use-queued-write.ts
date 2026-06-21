"use client"

import { useRef, type RefObject } from "react"

import { type Result } from "@workspace/game/foundation"

import { useMonotonicVersionRef } from "./use-monotonic-version-ref"

/**
 * The single queued versioned-write primitive the encounter surfaces compose
 * through (UNN-378) — the *receive half* of the optimistic-concurrency protocol
 * the DM console, encounter setup, and the player's own-combat-event surface all
 * used to hand-roll with diverging, buggy semantics. It owns three things and
 * nothing else:
 *
 * 1. **A monotonic version ref** ({@link useMonotonicVersionRef}) synced
 *    forward-only from `serverVersion`, so a stale render frame can never roll
 *    the token back below one a write already advanced.
 * 2. **A serialized dispatch queue** (a promise chain, the same shape
 *    `useDebouncedAutoSave`'s `saveQueueRef` uses): each `enqueue` chains behind
 *    the in-flight write and reads the **fresh** `versionRef.current` its
 *    predecessor produced, so back-to-back dispatches can't collide on one stale
 *    `expectedVersion` — the second tap within a round-trip lands instead of
 *    being spuriously rejected as `stale`.
 * 3. **One-shot stale-retry** (when `refetchVersion` is supplied): on a genuine
 *    cross-writer `"stale"`, refetch the current server version, forward the ref,
 *    and retry the action once; a second `"stale"` is a real conflict and falls
 *    through to the caller's error path. Retrying is safe because the encounter
 *    Server Action re-reduces the *event* onto the latest persisted session.
 *
 * The hook owns **no** `useTransition`, `useOptimistic`, toast, `router.refresh()`,
 * or disabling — those stay the caller's. It returns the version ref (read it for
 * the optimistic frame's expected version, hand it to the realtime ping compare)
 * and `enqueue`.
 *
 * **Reconcile cadence.** Each caller still `router.refresh()`es per write, inside
 * its own pending transition, exactly as before — that keeps each transition's
 * optimistic frame mounted until its truth lands (no flicker). Collapsing a burst
 * of N rapid clicks into a single end-of-burst reconcile is deliberately *not*
 * here: it only pays off once controls stop disabling on `isPending` (the
 * spam-click follow-up), and doing it correctly means rethinking the per-transition
 * optimistic revert — entangled enough to belong with that work. The queue this
 * hook adds is the prerequisite that unblocks it.
 */
export interface UseQueuedWriteArgs {
  serverVersion: number
  /** Fetches the current server version for the stale-retry path; omit to make
   *  a `"stale"` surface immediately with no retry. Returns `null` when the
   *  refetch itself fails (row gone, action threw) — the original `"stale"` then
   *  bubbles through unchanged. */
  refetchVersion?: () => Promise<number | null>
}

export interface UseQueuedWriteReturn {
  versionRef: RefObject<number>
  enqueue: <TSuccess extends { version: number }, TError extends string>(
    action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
  ) => Promise<Result<TSuccess, TError>>
}

export function useQueuedWrite({
  serverVersion,
  refetchVersion,
}: UseQueuedWriteArgs): UseQueuedWriteReturn {
  const versionRef = useMonotonicVersionRef(serverVersion)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())

  function enqueue<TSuccess extends { version: number }, TError extends string>(
    action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
  ): Promise<Result<TSuccess, TError>> {
    const run = queueRef.current.then(() => dispatch(action))
    // Keep the queue resolved even if a dispatch rejects, so the next enqueue
    // still flows behind it rather than inheriting a rejected chain.
    queueRef.current = run.catch(() => {})
    return run
  }

  async function dispatch<
    TSuccess extends { version: number },
    TError extends string,
  >(
    action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
  ): Promise<Result<TSuccess, TError>> {
    const first = await action(versionRef.current)
    if (first.ok) {
      versionRef.current = first.value.version
      return first
    }
    if (first.error !== "stale" || !refetchVersion) return first

    const fresh = await refetchVersion()
    if (fresh === null) return first
    if (fresh > versionRef.current) versionRef.current = fresh

    const second = await action(versionRef.current)
    if (second.ok) versionRef.current = second.value.version
    return second
  }

  return { versionRef, enqueue }
}
