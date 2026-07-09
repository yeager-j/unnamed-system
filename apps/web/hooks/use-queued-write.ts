"use client"

import { useRef, type RefObject } from "react"

import { type Result } from "@workspace/game-v2/kernel/result"

import { useMonotonicVersionRef } from "./use-monotonic-version-ref"
import {
  createWriteQueue,
  type WriteQueue,
  type WriteQueueTokenPort,
} from "./write-queue"

/**
 * The single-row façade over the queued versioned-write core (UNN-378;
 * UNN-567) — the *receive half* of the optimistic-concurrency protocol the DM
 * console, encounter setup, and the dungeon console compose for their
 * encounter/Instance rows. The protocol itself (serialized dispatch, monotonic
 * token accounting, one-shot stale-retry) lives in {@link createWriteQueue};
 * this hook owns only the React wiring:
 *
 * 1. **A monotonic version ref** ({@link useMonotonicVersionRef}) synced
 *    forward-only from `serverVersion`, exposed as `versionRef` so callers can
 *    read it for an optimistic frame's expected version, hand it to the
 *    realtime ping compare, or ride it as the *other* row's token in a paired
 *    write (`dispatch-event.ts` reads both).
 * 2. **The token port + spine** handed to the core — the port's `bump` is the
 *    forward-only set, also returned as {@link UseQueuedWriteReturn.bump} for
 *    folding a paired action's returned sibling version (never hand-advance by
 *    `+= 1`; fold what the server returned).
 *
 * The hook owns **no** `useTransition`, `useOptimistic`, toast,
 * `router.refresh()`, or disabling — those stay the caller's.
 *
 * **Reconcile cadence.** Each caller still `router.refresh()`es per write,
 * inside its own pending transition, exactly as before — that keeps each
 * transition's optimistic frame mounted until its truth lands (no flicker).
 * Collapsing a burst of N rapid clicks into a single end-of-burst reconcile is
 * deliberately *not* here: it only pays off once controls stop disabling on
 * `isPending` (the spam-click follow-up), and doing it correctly means
 * rethinking the per-transition optimistic revert — entangled enough to belong
 * with that work.
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
  /** Forward-only fold of a server-returned version into the token — for
   *  paired writes whose action bumped this row as a side effect. */
  bump: (version: number) => void
  enqueue: <TSuccess extends { version: number }, TError extends string>(
    action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
  ) => Promise<Result<TSuccess, TError>>
}

export function useQueuedWrite({
  serverVersion,
  refetchVersion,
}: UseQueuedWriteArgs): UseQueuedWriteReturn {
  const versionRef = useMonotonicVersionRef(serverVersion)
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  // All state lives in the two refs; the port and core are cheap closures
  // assembled at event time (never during render — the ref stays unread until
  // a dispatch), so the core always sees this render's `refetchVersion`
  // without a staleness bridge.
  const token: WriteQueueTokenPort = {
    read: () => versionRef.current,
    bump: (version) => {
      if (version > versionRef.current) versionRef.current = version
    },
  }
  const enqueue: WriteQueue["enqueue"] = (action) =>
    createWriteQueue({ token, refetchVersion, chain: chainRef }).enqueue(action)

  return { versionRef, bump: token.bump, enqueue }
}
