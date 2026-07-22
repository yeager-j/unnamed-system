// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "@workspace/result"

import { useQueuedWrite } from "./use-queued-write"

type WriteResult = Result<{ version: number }, string>

/** Lets several queued microtasks (the `.then` chain + dispatch's awaits) drain
 *  between assertions without leaning on timers. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/**
 * A manually-resolved action: each invocation records the `expectedVersion` it
 * was handed and parks until the test fires its `resolve`. Reproduces the
 * back-to-back / slow-network races deterministically.
 */
function makeControlledAction() {
  const calls: {
    expectedVersion: number
    resolve: (result: WriteResult) => void
  }[] = []
  const action = (expectedVersion: number) =>
    new Promise<WriteResult>((resolve) => {
      calls.push({ expectedVersion, resolve })
    })
  return { action, calls }
}

describe("useQueuedWrite", () => {
  it("serializes back-to-back dispatches so each carries its predecessor's version", async () => {
    const { result } = renderHook(() => useQueuedWrite({ serverVersion: 1 }))
    const { action, calls } = makeControlledAction()

    let first: Promise<WriteResult>
    let second: Promise<WriteResult>
    act(() => {
      first = result.current.enqueue(action)
      second = result.current.enqueue(action)
    })
    await flush()

    // Only the first write is in flight — the second waits behind it.
    expect(calls).toHaveLength(1)
    expect(calls[0]!.expectedVersion).toBe(1)

    act(() => calls[0]!.resolve(ok({ version: 2 })))
    await act(async () => {
      await first
    })
    await flush()

    // The second now dispatches with the version the first produced, not the
    // stale seed both would have shared without the queue.
    expect(calls).toHaveLength(2)
    expect(calls[1]!.expectedVersion).toBe(2)
    expect(result.current.versionRef.current).toBe(2)

    act(() => calls[1]!.resolve(ok({ version: 3 })))
    await expect(second!).resolves.toEqual(ok({ version: 3 }))
    expect(result.current.versionRef.current).toBe(3)
  })

  it("refetches and retries once on a cross-writer stale", async () => {
    const refetchVersion = vi.fn(async () => 5)
    const { result } = renderHook(() =>
      useQueuedWrite({ serverVersion: 1, refetchVersion })
    )

    const seen: number[] = []
    const responses: WriteResult[] = [err("stale"), ok({ version: 6 })]
    const action = (expectedVersion: number) => {
      seen.push(expectedVersion)
      return Promise.resolve(responses.shift()!)
    }

    let dispatched: Promise<WriteResult>
    act(() => {
      dispatched = result.current.enqueue(action)
    })

    await expect(dispatched!).resolves.toEqual(ok({ version: 6 }))
    expect(refetchVersion).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([1, 5]) // first at the seed, retry at the refetched token
    expect(result.current.versionRef.current).toBe(6)
  })

  it("surfaces the stale when the retry stales again", async () => {
    const refetchVersion = vi.fn(async () => 5)
    const { result } = renderHook(() =>
      useQueuedWrite({ serverVersion: 1, refetchVersion })
    )

    const action = vi.fn(async () => err("stale") as WriteResult)

    let dispatched: Promise<WriteResult>
    act(() => {
      dispatched = result.current.enqueue(action)
    })

    await expect(dispatched!).resolves.toEqual(err("stale"))
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("bubbles the original stale when the refetch can't resolve a version", async () => {
    const refetchVersion = vi.fn(async () => null)
    const { result } = renderHook(() =>
      useQueuedWrite({ serverVersion: 1, refetchVersion })
    )

    const action = vi.fn(async () => err("stale") as WriteResult)

    let dispatched: Promise<WriteResult>
    act(() => {
      dispatched = result.current.enqueue(action)
    })

    await expect(dispatched!).resolves.toEqual(err("stale"))
    expect(action).toHaveBeenCalledTimes(1) // no retry without a fresh version
  })

  it("returns a non-stale error immediately without refetching", async () => {
    const refetchVersion = vi.fn(async () => 5)
    const { result } = renderHook(() =>
      useQueuedWrite({ serverVersion: 1, refetchVersion })
    )

    const action = vi.fn(async () => err("encounter-not-found") as WriteResult)

    let dispatched: Promise<WriteResult>
    act(() => {
      dispatched = result.current.enqueue(action)
    })

    await expect(dispatched!).resolves.toEqual(err("encounter-not-found"))
    expect(refetchVersion).not.toHaveBeenCalled()
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("keeps the queue flowing after a dispatch throws", async () => {
    const { result } = renderHook(() => useQueuedWrite({ serverVersion: 1 }))

    const thrower = () => Promise.reject(new Error("network drop"))
    const { action: ok2, calls } = makeControlledAction()

    let failed: Promise<WriteResult>
    let next: Promise<WriteResult>
    act(() => {
      failed = result.current.enqueue(thrower)
      next = result.current.enqueue(ok2)
    })
    await expect(failed!).rejects.toThrow("network drop")
    await flush()

    // The thrown write didn't poison the chain — the next write still dispatches.
    expect(calls).toHaveLength(1)
    act(() => calls[0]!.resolve(ok({ version: 2 })))
    await expect(next!).resolves.toEqual(ok({ version: 2 }))
    expect(result.current.versionRef.current).toBe(2)
  })

  it("bump folds forward-only — a paired write's sibling version advances, a stale one is dropped", () => {
    const { result } = renderHook(() => useQueuedWrite({ serverVersion: 4 }))

    act(() => result.current.bump(7))
    expect(result.current.versionRef.current).toBe(7)

    act(() => result.current.bump(5))
    expect(result.current.versionRef.current).toBe(7)
  })
})
