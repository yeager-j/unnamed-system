// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSnapshotSubscription } from "./use-snapshot-subscription"

// Mock the realtime SDK boundary and drive the captured callbacks directly (same
// rationale as the UNN-372 watch tests). The default — no callbacks fired — means
// realtime never reports available, so the poll-path tests run the degraded mode.
const useRealtimeChannelMock = vi.fn()
vi.mock("./use-realtime-channel", () => ({
  useRealtimeChannel: (args: unknown) => useRealtimeChannelMock(args),
}))

interface CapturedChannelArgs {
  domain: string
  onPing: (data: unknown) => void
  onReconnect?: () => void
  onAvailabilityChange?: (available: boolean) => void
}

function channelArgs(): CapturedChannelArgs {
  return useRealtimeChannelMock.mock.lastCall![0] as CapturedChannelArgs
}

interface TestSnap {
  version: number
  instanceVersion: number
  status: string
  tag: string
}

function snap(overrides: Partial<TestSnap> = {}): TestSnap {
  return {
    version: 1,
    instanceVersion: 1,
    status: "active",
    tag: "init",
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function render(
  fetcher: (shortId: string, signal?: AbortSignal) => Promise<TestSnap>,
  initial: TestSnap = snap()
) {
  return renderHook(() =>
    useSnapshotSubscription<TestSnap>({
      shortId: "s1",
      domain: "dungeon",
      initialSnapshot: initial,
      fetcher,
      isEnded: (status) => status === "done",
    })
  )
}

async function tick(ms = 1500) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("useSnapshotSubscription — version-kind ping routing", () => {
  it("routes a mapInstance ping against the Instance ref, not the temporal ref", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        snap({ version: 9, instanceVersion: 9, tag: "fetched" })
      )
    render(fetcher, snap({ version: 5, instanceVersion: 1 }))
    act(() => channelArgs().onAvailabilityChange?.(true))

    // A temporal ping below the temporal ref (5) is an echo — dropped.
    await act(async () => channelArgs().onPing({ kind: "dungeon", version: 3 }))
    expect(fetcher).not.toHaveBeenCalled()

    // A mapInstance ping above the Instance ref (1) refetches — even though its
    // version (2) is below the temporal ref (5). Proves it compares the right ref.
    await act(async () =>
      channelArgs().onPing({ kind: "mapInstance", version: 2 })
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe("useSnapshotSubscription — composite apply-side guard", () => {
  it("drops a fetched snapshot that regressed the temporal version", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(snap({ version: 2, instanceVersion: 2, tag: "older" }))
    const { result } = render(
      fetcher,
      snap({ version: 5, instanceVersion: 5, tag: "current" })
    )

    await tick() // realtime never available → poll fires the fetch

    expect(fetcher).toHaveBeenCalled()
    expect(result.current.snapshot.tag).toBe("current")
    // We reached the server, the data was just not newer — not a staleness signal.
    expect(result.current.stale).toBe(false)
  })

  it("drops a response that regressed the Instance version even if the temporal version advanced", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(snap({ version: 6, instanceVersion: 4, tag: "mixed" }))
    const { result } = render(
      fetcher,
      snap({ version: 5, instanceVersion: 5, tag: "current" })
    )

    await tick()

    expect(result.current.snapshot.tag).toBe("current")
  })

  it("aborts a superseded in-flight refetch so an out-of-order response can't regress the view", async () => {
    const first = deferred<TestSnap>()
    const second = deferred<TestSnap>()
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = render(fetcher, snap({ version: 1, instanceVersion: 1 }))
    act(() => channelArgs().onAvailabilityChange?.(true))

    // Two pings in quick succession: the second aborts the first's in-flight fetch.
    await act(async () => channelArgs().onPing({ kind: "dungeon", version: 5 }))
    await act(async () => channelArgs().onPing({ kind: "dungeon", version: 6 }))
    expect(fetcher).toHaveBeenCalledTimes(2)

    // The newer (v6) response lands first and is applied.
    await act(async () => {
      second.resolve(snap({ version: 6, instanceVersion: 6, tag: "v6" }))
    })
    expect(result.current.snapshot.tag).toBe("v6")

    // The late, superseded (v5) response lands — dropped, so the view holds v6.
    await act(async () => {
      first.resolve(snap({ version: 5, instanceVersion: 5, tag: "v5" }))
    })
    expect(result.current.snapshot.tag).toBe("v6")
  })
})

describe("useSnapshotSubscription — degraded polling", () => {
  it("polls and applies a fresher snapshot when realtime is unavailable", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(snap({ version: 2, instanceVersion: 2, tag: "next" }))
    const { result } = render(fetcher, snap({ tag: "init" }))

    await tick()

    expect(fetcher).toHaveBeenCalledWith("s1", expect.anything())
    expect(result.current.snapshot.tag).toBe("next")
  })
})
