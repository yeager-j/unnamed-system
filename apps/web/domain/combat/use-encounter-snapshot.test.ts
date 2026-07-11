// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useEncounterSnapshot,
  type WatchSnapshot,
} from "./use-encounter-snapshot"

// The realtime subscription is the SDK boundary — mock it and drive the hook's
// callbacks directly (the same rationale as the UNN-372 tests): availability
// toggles the poll fallback, pings exercise the version compare, and the
// captured args expose `enabled` for the ended case. The mock's default (no
// callbacks fired) means realtime never reports available, so the poll-path
// tests below exercise exactly the degraded mode.
const useRealtimeChannelMock = vi.fn()
vi.mock("@/lib/sync/use-realtime-channel", () => ({
  useRealtimeChannel: (args: unknown) => useRealtimeChannelMock(args),
}))

interface CapturedChannelArgs {
  enabled?: boolean
  onPing: (data: unknown) => void
  onReconnect?: () => void
  onAvailabilityChange?: (available: boolean) => void
}

function channelArgs(): CapturedChannelArgs {
  return useRealtimeChannelMock.mock.lastCall![0] as CapturedChannelArgs
}

const POLL_MS = 1500

function makeSnapshot(overrides: Partial<WatchSnapshot> = {}): WatchSnapshot {
  const base = {
    status: "live",
    name: "Test Encounter",
    campaignShortId: "camp-1",
    version: 1,
    instanceVersion: 0,
    round: 1,
    currentActor: null,
    combatants: [],
    zones: [],
    connections: [],
    exits: [],
    ...overrides,
  }
  // Mirror the server fold's shape so distinct row versions yield distinct
  // composites (a test overriding only `version` still exercises an apply).
  return {
    compositeVersion:
      overrides.compositeVersion ??
      `e${base.version}.i${base.instanceVersion}.d`,
    ...base,
  }
}

async function tick(ms = POLL_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Stubs jsdom's (read-only) visibility state and fires the change event. */
async function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  })
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  // Unmount explicitly: without vitest globals RTL never auto-cleans, and a
  // hook left mounted would poll on a later test's visibilitychange dispatch.
  cleanup()
  // Restore the property only — no dispatch, nothing is mounted to hear it.
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("useEncounterSnapshot — polling fallback (realtime unavailable)", () => {
  it("polls and swaps in each fresh snapshot", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(makeSnapshot({ round: 2, version: 2 }))
    const { result } = renderHook(() =>
      useEncounterSnapshot("s1", makeSnapshot({ round: 1 }), fetcher)
    )

    expect(result.current.snapshot.round).toBe(1)

    await tick()

    expect(fetcher).toHaveBeenCalledWith("s1", expect.anything())
    expect(result.current.snapshot.round).toBe(2)
    expect(result.current.stale).toBe(false)
  })

  it("keeps the last good snapshot and retries when a poll fails", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makeSnapshot({ round: 5, version: 5 }))
    const { result } = renderHook(() =>
      useEncounterSnapshot("s1", makeSnapshot({ round: 1 }), fetcher)
    )

    await tick()
    expect(result.current.stale).toBe(true)
    expect(result.current.snapshot.round).toBe(1)

    await tick()
    expect(result.current.stale).toBe(false)
    expect(result.current.snapshot.round).toBe(5)
  })

  it("stops polling once the encounter has ended", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(makeSnapshot({ status: "ended", version: 2 }))
    const { result } = renderHook(() =>
      useEncounterSnapshot("s1", makeSnapshot({ status: "live" }), fetcher)
    )

    await tick()
    expect(result.current.snapshot.status).toBe("ended")

    const callsWhenEnded = fetcher.mock.calls.length
    await tick(POLL_MS * 4)
    expect(fetcher.mock.calls.length).toBe(callsWhenEnded)
  })

  it("never polls an encounter that is already ended on first render", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeSnapshot())
    renderHook(() =>
      useEncounterSnapshot("s1", makeSnapshot({ status: "ended" }), fetcher)
    )

    await tick(POLL_MS * 3)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("suspends polling while the tab is hidden, catches up immediately on return", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeSnapshot({ version: 2 }))
    renderHook(() => useEncounterSnapshot("s1", makeSnapshot(), fetcher))

    await tick()
    expect(fetcher).toHaveBeenCalledTimes(1)

    await setVisibility("hidden")
    await tick(POLL_MS * 4)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Foregrounding fetches at once (no interval-long stale window)…
    await setVisibility("visible")
    expect(fetcher).toHaveBeenCalledTimes(2)

    // …and the interval is running again.
    await tick()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it("does not poll at all when mounted in a hidden tab", async () => {
    await setVisibility("hidden")
    const fetcher = vi.fn().mockResolvedValue(makeSnapshot({ version: 2 }))
    renderHook(() => useEncounterSnapshot("s1", makeSnapshot(), fetcher))

    await tick(POLL_MS * 3)
    expect(fetcher).not.toHaveBeenCalled()

    await setVisibility("visible")
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe("useEncounterSnapshot — composite version (UNN-535)", () => {
  it("applies a response whose composite changed while both row tokens held still (durable vitals)", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      makeSnapshot({
        round: 4,
        version: 1,
        instanceVersion: 0,
        compositeVersion: "e1.i0.dchar-1:7",
      })
    )
    const { result } = renderHook(() =>
      useEncounterSnapshot(
        "s1",
        makeSnapshot({
          round: 1,
          version: 1,
          instanceVersion: 0,
          compositeVersion: "e1.i0.dchar-1:6",
        }),
        fetcher
      )
    )

    await tick()

    expect(result.current.snapshot.round).toBe(4)
  })

  it("skips the re-render when a poll returns an unchanged composite", async () => {
    const same = makeSnapshot({ round: 9, version: 1, instanceVersion: 0 })
    const fetcher = vi.fn().mockResolvedValue(same)
    const { result } = renderHook(() =>
      useEncounterSnapshot(
        "s1",
        makeSnapshot({ round: 1, version: 1, instanceVersion: 0 }),
        fetcher
      )
    )
    const initial = result.current.snapshot

    await tick()

    // Same composite as the seed ⇒ the identical-content response is dropped
    // before setState — the rendered snapshot object is still the seed.
    expect(fetcher).toHaveBeenCalled()
    expect(result.current.snapshot).toBe(initial)
    expect(result.current.stale).toBe(false)
  })
})

describe("useEncounterSnapshot — realtime transport (UNN-371)", () => {
  it("idles between pings while realtime is healthy — no interval traffic", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeSnapshot({ version: 2 }))
    renderHook(() => useEncounterSnapshot("s1", makeSnapshot(), fetcher))

    act(() => channelArgs().onAvailabilityChange?.(true))
    await tick(POLL_MS * 5)

    expect(fetcher).not.toHaveBeenCalled()
  })

  it("fetches once on a fresher ping and drops echoes/duplicates", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(makeSnapshot({ round: 3, version: 2 }))
    const { result } = renderHook(() =>
      useEncounterSnapshot("s1", makeSnapshot({ version: 1 }), fetcher)
    )
    act(() => channelArgs().onAvailabilityChange?.(true))

    // Stale and malformed pings: dropped.
    await act(async () => {
      channelArgs().onPing({ version: 1, status: "live" })
      channelArgs().onPing("garbage")
    })
    expect(fetcher).not.toHaveBeenCalled()

    // A fresher ping: exactly one fetch, snapshot + tracked version advance.
    await act(async () => {
      channelArgs().onPing({ version: 2, status: "live" })
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.current.snapshot.round).toBe(3)

    // The same ping again (sibling-tab echo): version now ≤ current, dropped.
    await act(async () => {
      channelArgs().onPing({ version: 2, status: "live" })
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("resumes polling when the connection drops, idles again when it returns", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeSnapshot({ version: 2 }))
    renderHook(() => useEncounterSnapshot("s1", makeSnapshot(), fetcher))

    act(() => channelArgs().onAvailabilityChange?.(true))
    await tick(POLL_MS * 2)
    expect(fetcher).not.toHaveBeenCalled()

    act(() => channelArgs().onAvailabilityChange?.(false))
    await tick(POLL_MS * 2)
    expect(fetcher).toHaveBeenCalledTimes(2)

    act(() => channelArgs().onAvailabilityChange?.(true))
    const callsWhenHealthy = fetcher.mock.calls.length
    await tick(POLL_MS * 3)
    expect(fetcher.mock.calls.length).toBe(callsWhenHealthy)
  })

  it("flags stale when a ping-triggered refetch fails, keeping the last good snapshot", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network"))
    const { result } = renderHook(() =>
      useEncounterSnapshot(
        "s1",
        makeSnapshot({ round: 1, version: 1 }),
        fetcher
      )
    )
    act(() => channelArgs().onAvailabilityChange?.(true))

    await act(async () => {
      channelArgs().onPing({ version: 2, status: "live" })
    })

    expect(result.current.stale).toBe(true)
    expect(result.current.snapshot.round).toBe(1)
  })

  it("refetches exactly once on reconnect to close the offline gap", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeSnapshot({ version: 4 }))
    renderHook(() => useEncounterSnapshot("s1", makeSnapshot(), fetcher))
    act(() => channelArgs().onAvailabilityChange?.(true))

    await act(async () => {
      channelArgs().onReconnect?.()
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("suspends the subscription once the encounter has ended", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(makeSnapshot({ status: "ended", version: 2 }))
    renderHook(() =>
      useEncounterSnapshot("s1", makeSnapshot({ status: "live" }), fetcher)
    )

    expect(channelArgs().enabled).toBe(true)

    await tick()

    expect(channelArgs().enabled).toBe(false)
  })
})
