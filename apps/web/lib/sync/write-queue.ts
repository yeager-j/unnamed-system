import { type Result } from "@workspace/game-v2/kernel/result"

/**
 * The React-free core of the queued versioned-write protocol (UNN-567) — the
 * queue-side twin of `version-token-store.ts`'s move: **one core, N façades
 * that differ by cardinality, not by invariant**. `useQueuedWrite` is the
 * single-row `RefObject` façade (one encounter/Instance row per hook); the DM
 * console's durable write lanes hold an open set of per-character cores over
 * a `MonotonicVersionMap`. Both run exactly this protocol:
 *
 * 1. **Serialized dispatch** — each {@link WriteQueue.enqueue} chains behind
 *    the in-flight write on the queue's spine and reads the **fresh** token its
 *    predecessor produced, so back-to-back dispatches can't collide on one
 *    stale `expectedVersion`.
 * 2. **Token accounting** — the token lives behind {@link WriteQueueTokenPort};
 *    `bump` is **forward-only** (the monotonic invariant lives in the port, so
 *    a refetch that races a fresher write can never roll the token back).
 * 3. **One-shot stale-retry** — on a genuine cross-writer `"stale"`, refetch
 *    the server token, bump it forward, retry the action once; a second
 *    `"stale"` is a real conflict and falls through to the caller.
 */

/**
 * Where a queue's version token lives — a `RefObject<number>` (the
 * `useQueuedWrite` façade), one key of a `MonotonicVersionMap` (a durable
 * write lane), or a per-class ref (the entity door). `bump` MUST be
 * forward-only: advance iff the given version is fresher.
 */
export interface WriteQueueTokenPort {
  read(): number
  bump(version: number): void
}

/** The serialization spine — structurally a React `RefObject<Promise<void>>`,
 *  declared inline so this module stays React-free. Pass a shared ref to make
 *  foreign steps (the debounced auto-save lifecycle) serialize on the same
 *  chain; omit it for a queue that owns its own. */
export interface WriteChain {
  current: Promise<void>
}

export interface WriteQueue {
  enqueue<TSuccess extends { version: number }, TError>(
    action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
  ): Promise<Result<TSuccess, TError>>
  /** Serialize a step on this queue without reading or bumping its token. */
  enqueueStep<T>(action: () => Promise<T>): Promise<T>
}

/**
 * One protocol pass — dispatch at the current token, bump on success,
 * one-shot stale-retry through `refetchVersion`. Exported for callers that are
 * **already serialized** by other means (the debounced auto-save chains raw on
 * its class spine) and must not re-enqueue — enqueueing from inside a chained
 * step would wait on itself. Everything else goes through
 * {@link createWriteQueue}.
 */
export async function runVersionedWrite<
  TSuccess extends { version: number },
  TError,
>(
  token: WriteQueueTokenPort,
  refetchVersion: (() => Promise<number | null>) | undefined,
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
): Promise<Result<TSuccess, TError>> {
  const first = await action(token.read())
  if (first.ok) {
    token.bump(first.value.version)
    return first
  }
  if (first.error !== "stale" || !refetchVersion) return first

  const fresh = await refetchVersion()
  if (fresh === null) return first
  token.bump(fresh)

  const second = await action(token.read())
  if (second.ok) token.bump(second.value.version)
  return second
}

export function createWriteQueue(options: {
  token: WriteQueueTokenPort
  /** Fetches the current server token for the stale-retry; omit to make a
   *  `"stale"` surface immediately with no retry. `null` when the refetch
   *  itself fails — the original `"stale"` then bubbles through unchanged. */
  refetchVersion?: () => Promise<number | null>
  chain?: WriteChain
}): WriteQueue {
  const { token, refetchVersion } = options
  const chain = options.chain ?? { current: Promise.resolve() }

  function enqueueStep<T>(action: () => Promise<T>): Promise<T> {
    const run = chain.current.then(action)
    // Keep the spine resolved even if a dispatch rejects, so the next
    // enqueue still flows behind it rather than inheriting a rejected chain.
    chain.current = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  return {
    enqueue(action) {
      return enqueueStep(() => runVersionedWrite(token, refetchVersion, action))
    },
    enqueueStep,
  }
}
