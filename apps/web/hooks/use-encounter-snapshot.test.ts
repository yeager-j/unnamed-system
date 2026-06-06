// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EncounterSnapshot } from "@workspace/game/encounter"

import { useEncounterSnapshot } from "./use-encounter-snapshot"

const POLL_MS = 1500

function makeSnapshot(
  overrides: Partial<EncounterSnapshot> = {}
): EncounterSnapshot {
  return {
    status: "live",
    name: "Test Encounter",
    campaignShortId: "camp-1",
    round: 1,
    currentActor: null,
    combatants: [],
    zones: [],
    ...overrides,
  }
}

async function tick(ms = POLL_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("useEncounterSnapshot", () => {
  it("polls and swaps in each fresh snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValue(makeSnapshot({ round: 2 }))
    const { result } = renderHook(() =>
      useEncounterSnapshot("s1", makeSnapshot({ round: 1 }), fetcher)
    )

    expect(result.current.snapshot.round).toBe(1)

    await tick()

    expect(fetcher).toHaveBeenCalledWith("s1")
    expect(result.current.snapshot.round).toBe(2)
    expect(result.current.stale).toBe(false)
  })

  it("keeps the last good snapshot and retries when a poll fails", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makeSnapshot({ round: 5 }))
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
    const fetcher = vi.fn().mockResolvedValue(makeSnapshot({ status: "ended" }))
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
})
