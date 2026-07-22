import { describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "@workspace/result"

import {
  createWriteQueue,
  runVersionedWrite,
  type WriteQueueTokenPort,
} from "./write-queue"

type WriteResult = Result<{ version: number }, string>

/** A forward-only in-memory token — the invariant every real port carries. */
function makeToken(initial: number): WriteQueueTokenPort {
  let value = initial
  return {
    read: () => value,
    bump: (version) => {
      if (version > value) value = version
    },
  }
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

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("createWriteQueue", () => {
  it("serializes back-to-back enqueues so each carries its predecessor's version", async () => {
    const token = makeToken(1)
    const queue = createWriteQueue({ token })
    const { action, calls } = makeControlledAction()

    const first = queue.enqueue(action)
    const second = queue.enqueue(action)
    await flush()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.expectedVersion).toBe(1)

    calls[0]!.resolve(ok({ version: 2 }))
    await first
    await flush()

    expect(calls).toHaveLength(2)
    expect(calls[1]!.expectedVersion).toBe(2)

    calls[1]!.resolve(ok({ version: 3 }))
    await expect(second).resolves.toEqual(ok({ version: 3 }))
    expect(token.read()).toBe(3)
  })

  it("refetches and retries once on a cross-writer stale", async () => {
    const token = makeToken(1)
    const refetchVersion = vi.fn(async () => 5)
    const queue = createWriteQueue({ token, refetchVersion })

    const seen: number[] = []
    const responses: WriteResult[] = [err("stale"), ok({ version: 6 })]
    const action = (expectedVersion: number) => {
      seen.push(expectedVersion)
      return Promise.resolve(responses.shift()!)
    }

    await expect(queue.enqueue(action)).resolves.toEqual(ok({ version: 6 }))
    expect(refetchVersion).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([1, 5])
    expect(token.read()).toBe(6)
  })

  it("surfaces the stale when the retry stales again", async () => {
    const queue = createWriteQueue({
      token: makeToken(1),
      refetchVersion: async () => 5,
    })
    const action = vi.fn(async () => err("stale") as WriteResult)

    await expect(queue.enqueue(action)).resolves.toEqual(err("stale"))
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("bubbles the original stale when the refetch can't resolve a version", async () => {
    const queue = createWriteQueue({
      token: makeToken(1),
      refetchVersion: async () => null,
    })
    const action = vi.fn(async () => err("stale") as WriteResult)

    await expect(queue.enqueue(action)).resolves.toEqual(err("stale"))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("returns a non-stale error immediately without refetching", async () => {
    const refetchVersion = vi.fn(async () => 5)
    const queue = createWriteQueue({ token: makeToken(1), refetchVersion })
    const action = vi.fn(async () => err("gone") as WriteResult)

    await expect(queue.enqueue(action)).resolves.toEqual(err("gone"))
    expect(refetchVersion).not.toHaveBeenCalled()
  })

  it("runs only once on stale when the queue has no refetch arm", async () => {
    const queue = createWriteQueue({ token: makeToken(1) })
    const action = vi.fn(async () => err("stale") as WriteResult)

    await expect(queue.enqueue(action)).resolves.toEqual(err("stale"))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("accepts structured action errors", async () => {
    const queue = createWriteQueue({ token: makeToken(1) })
    const failure = { kind: "missing-requirement" as const, reason: "Name" }

    await expect(queue.enqueue(async () => err(failure))).resolves.toEqual(
      err(failure)
    )
  })

  it("never rolls the token back when the refetch races a fresher write", async () => {
    const token = makeToken(1)
    // The refetch answers 5, but by retry time a concurrent ping already
    // advanced the token to 9 — the retry must dispatch at 9, not 5.
    const queue = createWriteQueue({
      token,
      refetchVersion: async () => {
        token.bump(9)
        return 5
      },
    })

    const seen: number[] = []
    const responses: WriteResult[] = [err("stale"), ok({ version: 10 })]
    const action = (expectedVersion: number) => {
      seen.push(expectedVersion)
      return Promise.resolve(responses.shift()!)
    }

    await expect(queue.enqueue(action)).resolves.toEqual(ok({ version: 10 }))
    expect(seen).toEqual([1, 9])
  })

  it("keeps the spine flowing after a dispatch throws", async () => {
    const token = makeToken(1)
    const queue = createWriteQueue({ token })
    const thrower = () => Promise.reject(new Error("network drop"))
    const { action, calls } = makeControlledAction()

    const failed = queue.enqueue(thrower)
    const next = queue.enqueue(action)
    await expect(failed).rejects.toThrow("network drop")
    await flush()

    expect(calls).toHaveLength(1)
    calls[0]!.resolve(ok({ version: 2 }))
    await expect(next).resolves.toEqual(ok({ version: 2 }))
    expect(token.read()).toBe(2)
  })

  it("serializes across two queues sharing one external chain", async () => {
    // The F4 shape: the click queue and the debounced auto-save share one
    // per-class spine, so a click write and a debounced save can't interleave.
    const chain = { current: Promise.resolve() }
    const token = makeToken(1)
    const clickQueue = createWriteQueue({ token, chain })
    const saveQueue = createWriteQueue({ token, chain })
    const { action, calls } = makeControlledAction()

    const click = clickQueue.enqueue(action)
    const save = saveQueue.enqueue(action)
    await flush()

    expect(calls).toHaveLength(1)
    calls[0]!.resolve(ok({ version: 2 }))
    await click
    await flush()

    expect(calls).toHaveLength(2)
    expect(calls[1]!.expectedVersion).toBe(2)
    calls[1]!.resolve(ok({ version: 3 }))
    await expect(save).resolves.toEqual(ok({ version: 3 }))
  })

  it("serializes unversioned steps on the same spine without changing the token", async () => {
    const token = makeToken(1)
    const queue = createWriteQueue({ token })
    const { action, calls } = makeControlledAction()
    const step = vi.fn(async () => "advanced")

    const write = queue.enqueue(action)
    const advanced = queue.enqueueStep(step)
    await flush()

    expect(step).not.toHaveBeenCalled()
    calls[0]!.resolve(ok({ version: 2 }))
    await write
    await expect(advanced).resolves.toBe("advanced")
    expect(token.read()).toBe(2)
  })

  it("continues to an unversioned step after a versioned refusal", async () => {
    const queue = createWriteQueue({ token: makeToken(1) })

    await expect(queue.enqueue(async () => err("stale"))).resolves.toEqual(
      err("stale")
    )
    await expect(queue.enqueueStep(async () => "navigated")).resolves.toBe(
      "navigated"
    )
  })
})

describe("runVersionedWrite", () => {
  it("runs one protocol pass without a queue (the pre-serialized caller shape)", async () => {
    const token = makeToken(3)
    const seen: number[] = []
    const responses: WriteResult[] = [err("stale"), ok({ version: 8 })]
    const action = (expectedVersion: number) => {
      seen.push(expectedVersion)
      return Promise.resolve(responses.shift()!)
    }

    const result = await runVersionedWrite(token, async () => 7, action)
    expect(result).toEqual(ok({ version: 8 }))
    expect(seen).toEqual([3, 7])
    expect(token.read()).toBe(8)
  })
})
