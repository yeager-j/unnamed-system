// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getCharacterVersionsAction } from "../lib/actions/character-versions"
import { err, ok, type Result } from "../lib/game/result"
import { useDebouncedAutoSave } from "./use-debounced-auto-save"

vi.mock("../lib/actions/character-versions", () => ({
  getCharacterVersionsAction: vi.fn(),
}))

vi.mock("./use-character-versions-broadcast", () => ({
  broadcastCharacterVersion: vi.fn(),
}))

type SaveCall = {
  value: string
  expectedVersion: number
  resolve: (result: Result<{ value: string; version: number }, string>) => void
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
    expectedVersion: number
  ) => Promise<Result<{ value: string; version: number }, string>>
  calls: SaveCall[]
} {
  const calls: SaveCall[] = []
  const save = (value: string, expectedVersion: number) =>
    new Promise<Result<{ value: string; version: number }, string>>(
      (resolve) => {
        calls.push({ value, expectedVersion, resolve })
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

const FIXED_ARGS = {
  characterId: "char-test",
  characterClass: "identity" as const,
}

describe("useDebouncedAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getCharacterVersionsAction).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("serializes a follow-up save: B reads the post-A version", async () => {
    const { save, calls } = makeControlledSave()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "",
        serverVersion: 0,
        save,
      })
    )

    // Type "A" → wait for debounce → save("A", 0) dispatched.
    act(() => result.current.setValue("A"))
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.value).toBe("A")
    expect(calls[0]!.expectedVersion).toBe(0)

    // Type "B" mid-flight → its save chains; nothing dispatched yet.
    act(() => result.current.setValue("B"))
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)

    // A returns at version 1. Drain microtasks so the chained B fires.
    await act(async () => {
      calls[0]!.resolve(ok({ value: "A", version: 1 }))
    })
    await flushMicrotasks()

    expect(calls).toHaveLength(2)
    expect(calls[1]!.value).toBe("B")
    // The whole point: B picked up the fresh post-A version, not the stale 0.
    expect(calls[1]!.expectedVersion).toBe(1)
  })

  it("on flush, reverts to last-saved when the draft is empty", async () => {
    const { save, calls } = makeControlledSave()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        serverVersion: 0,
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
      calls[0]!.resolve(ok({ value: "Iris", version: 1 }))
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
    const { save, calls } = makeControlledSave()

    const { result, unmount } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "",
        serverVersion: 0,
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
    expect(calls[0]!.expectedVersion).toBe(0)
  })

  it("on unmount, skips the save when the draft is empty", async () => {
    const { save, calls } = makeControlledSave()

    const { result, unmount } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        serverVersion: 0,
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
    const onError = vi.fn()
    // First call throws, second resolves — proves the queue isn't poisoned.
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {})
    const calls: SaveCall[] = []
    let callIndex = 0
    const save = (value: string, expectedVersion: number) =>
      new Promise<Result<{ value: string; version: number }, string>>(
        (resolve, reject) => {
          calls.push({ value, expectedVersion, resolve })
          const thisIndex = callIndex++
          // Defer to next microtask so the test can interleave.
          queueMicrotask(() => {
            if (thisIndex === 0) reject(new Error("network down"))
          })
        }
      )

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        serverVersion: 0,
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
      calls[1]!.resolve(ok({ value: "Iris", version: 1 }))
    })
    await flushMicrotasks()
    expect(result.current.value).toBe("Iris")

    consoleErr.mockRestore()
  })

  it("on first-attempt stale, silently refetches + retries before surfacing an error", async () => {
    const { save, calls } = makeControlledSave()
    const onError = vi.fn()
    vi.mocked(getCharacterVersionsAction).mockResolvedValue(
      ok({
        identityVersion: 5,
        vitalsVersion: 0,
        inventoryVersion: 0,
        progressionVersion: 0,
      })
    )

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        serverVersion: 0,
        save,
        onError,
      })
    )

    // Type "Iris", flush — first save dispatched with stale version 0.
    act(() => result.current.setValue("Iris"))
    act(() => result.current.flush())
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.expectedVersion).toBe(0)

    // Server says stale → helper refetches and retries with fresh version 5.
    await act(async () => {
      calls[0]!.resolve(err("stale"))
    })
    await flushMicrotasks()
    await flushMicrotasks()

    expect(getCharacterVersionsAction).toHaveBeenCalledOnce()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.expectedVersion).toBe(5)

    // Retry succeeds → draft sticks, no error surfaced.
    await act(async () => {
      calls[1]!.resolve(ok({ value: "Iris", version: 6 }))
    })
    await flushMicrotasks()

    expect(result.current.value).toBe("Iris")
    expect(onError).not.toHaveBeenCalled()
  })

  it("on second stale (retry also fails), rolls back and surfaces the error", async () => {
    const { save, calls } = makeControlledSave()
    const onError = vi.fn()
    vi.mocked(getCharacterVersionsAction).mockResolvedValue(
      ok({
        identityVersion: 5,
        vitalsVersion: 0,
        inventoryVersion: 0,
        progressionVersion: 0,
      })
    )

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        serverVersion: 0,
        save,
        onError,
      })
    )

    act(() => result.current.setValue("Iris"))
    act(() => result.current.flush())
    await flushMicrotasks()
    await act(async () => {
      calls[0]!.resolve(err("stale"))
    })
    await flushMicrotasks()
    await flushMicrotasks()
    expect(calls).toHaveLength(2)

    // Second stale → fall through to error path.
    await act(async () => {
      calls[1]!.resolve(err("stale"))
    })
    await flushMicrotasks()

    expect(result.current.value).toBe("Mira")
    expect(onError).toHaveBeenCalledWith("stale")
  })

  it("on failure, rolls the draft back to the last-saved value", async () => {
    const { save, calls } = makeControlledSave()
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        serverVersion: 0,
        save,
        onError,
      })
    )

    act(() => result.current.setValue("Iris"))
    act(() => result.current.flush())
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    await act(async () => {
      calls[0]!.resolve(err("invalid-input"))
    })
    await flushMicrotasks()

    expect(result.current.value).toBe("Mira")
    expect(onError).toHaveBeenCalledWith("invalid-input")
  })
})
