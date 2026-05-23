// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "../lib/game/result"
import { useDebouncedAutoSave } from "./use-debounced-auto-save"

type SaveCall = {
  value: string
  expectedUpdatedAt: Date
  resolve: (result: Result<{ value: string; updatedAt: Date }, string>) => void
}

/**
 * Builds a `save` mock whose returned promises are manually controlled —
 * each invocation gets its own `resolve` that the test fires when it wants
 * the server response to land. Lets us reproduce a slow-network race
 * deterministically without timers.
 */
function makeControlledSave(): {
  save: (
    value: string,
    expectedUpdatedAt: Date
  ) => Promise<Result<{ value: string; updatedAt: Date }, string>>
  calls: SaveCall[]
} {
  const calls: SaveCall[] = []
  const save = (value: string, expectedUpdatedAt: Date) =>
    new Promise<Result<{ value: string; updatedAt: Date }, string>>(
      (resolve) => {
        calls.push({ value, expectedUpdatedAt, resolve })
      }
    )
  return { save, calls }
}

/**
 * `performSave` chains the actual `save` invocation through `.then`, so
 * the request only goes out after the next microtask. Wrap any assertion
 * about a dispatched call in this helper.
 */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe("useDebouncedAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("serializes a follow-up save: B reads the post-A updatedAt", async () => {
    const T0 = new Date("2026-01-01T00:00:00Z")
    const T1 = new Date("2026-01-01T00:00:01Z")
    const { save, calls } = makeControlledSave()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "",
        serverUpdatedAt: T0,
        save,
      })
    )

    // Type "A" → wait for debounce → save("A", T0) dispatched.
    act(() => result.current.setValue("A"))
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.value).toBe("A")
    expect(calls[0]!.expectedUpdatedAt).toBe(T0)

    // Type "B" mid-flight → its save chains; nothing dispatched yet.
    act(() => result.current.setValue("B"))
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)

    // A returns at T1. Drain microtasks so the chained B fires.
    await act(async () => {
      calls[0]!.resolve(ok({ value: "A", updatedAt: T1 }))
    })
    await flushMicrotasks()

    expect(calls).toHaveLength(2)
    expect(calls[1]!.value).toBe("B")
    // The whole point: B picked up the fresh post-A token, not the stale T0.
    expect(calls[1]!.expectedUpdatedAt).toBe(T1)
  })

  it("on flush, reverts to last-saved when the draft is empty", async () => {
    const T0 = new Date("2026-01-01T00:00:00Z")
    const T1 = new Date("2026-01-01T00:00:01Z")
    const { save, calls } = makeControlledSave()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "Mira",
        serverUpdatedAt: T0,
        save,
        isEmpty: (next) => next.trim().length === 0,
      })
    )

    // Type "Iris" → flush → save dispatched and resolves.
    act(() => result.current.setValue("Iris"))
    act(() => result.current.flush())
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    await act(async () => {
      calls[0]!.resolve(ok({ value: "Iris", updatedAt: T1 }))
    })
    await flushMicrotasks()
    expect(result.current.value).toBe("Iris")

    // Clear the field. Mid-keystroke we preserve the empty draft so the
    // user can keep typing.
    act(() => result.current.setValue(""))
    expect(result.current.value).toBe("")

    // Flush (blur). Empty + differs from last-saved → snap back, no save.
    act(() => result.current.flush())
    await flushMicrotasks()
    expect(result.current.value).toBe("Iris")
    expect(calls).toHaveLength(1)
  })

  it("on unmount, dispatches a fire-and-forget save when the draft is dirty", async () => {
    const T0 = new Date("2026-01-01T00:00:00Z")
    const { save, calls } = makeControlledSave()

    const { result, unmount } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "",
        serverUpdatedAt: T0,
        save,
      })
    )

    // Type within the debounce window — nothing dispatched yet.
    act(() => result.current.setValue("dirty"))
    expect(calls).toHaveLength(0)

    // Unmount before the debounce elapses.
    unmount()
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.value).toBe("dirty")
    expect(calls[0]!.expectedUpdatedAt).toBe(T0)
  })

  it("on unmount, skips the save when the draft is empty", async () => {
    const T0 = new Date("2026-01-01T00:00:00Z")
    const { save, calls } = makeControlledSave()

    const { result, unmount } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "Mira",
        serverUpdatedAt: T0,
        save,
        isEmpty: (next) => next.trim().length === 0,
      })
    )

    act(() => result.current.setValue(""))
    unmount()
    await flushMicrotasks()
    expect(calls).toHaveLength(0)
  })

  it("when save throws, rolls back the draft and keeps the queue alive", async () => {
    const T0 = new Date("2026-01-01T00:00:00Z")
    const T1 = new Date("2026-01-01T00:00:01Z")
    const onError = vi.fn()
    // First call throws, second resolves — proves the queue isn't poisoned.
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {})
    const calls: SaveCall[] = []
    let callIndex = 0
    const save = (value: string, expectedUpdatedAt: Date) =>
      new Promise<Result<{ value: string; updatedAt: Date }, string>>(
        (resolve, reject) => {
          calls.push({ value, expectedUpdatedAt, resolve })
          const thisIndex = callIndex++
          // Defer to next microtask so the test can interleave.
          queueMicrotask(() => {
            if (thisIndex === 0) reject(new Error("network down"))
          })
        }
      )

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "Mira",
        serverUpdatedAt: T0,
        save,
        onError,
      })
    )

    // First save throws → revert, no onError (throws aren't typed TError).
    act(() => result.current.setValue("Iris"))
    act(() => result.current.flush())
    await flushMicrotasks()
    await flushMicrotasks()
    expect(result.current.value).toBe("Mira")
    expect(onError).not.toHaveBeenCalled()

    // Queue must still flow — a follow-up save dispatches and resolves.
    act(() => result.current.setValue("Iris"))
    act(() => result.current.flush())
    await flushMicrotasks()
    expect(calls).toHaveLength(2)
    await act(async () => {
      calls[1]!.resolve(ok({ value: "Iris", updatedAt: T1 }))
    })
    await flushMicrotasks()
    expect(result.current.value).toBe("Iris")

    consoleErr.mockRestore()
  })

  it("on failure, rolls the draft back to the last-saved value", async () => {
    const T0 = new Date("2026-01-01T00:00:00Z")
    const { save, calls } = makeControlledSave()
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "Mira",
        serverUpdatedAt: T0,
        save,
        onError,
      })
    )

    act(() => result.current.setValue("Iris"))
    act(() => result.current.flush())
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    await act(async () => {
      calls[0]!.resolve(err("stale"))
    })
    await flushMicrotasks()

    expect(result.current.value).toBe("Mira")
    expect(onError).toHaveBeenCalledWith("stale")
  })
})
