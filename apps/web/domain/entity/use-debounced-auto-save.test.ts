// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "@workspace/result"

import { useDebouncedAutoSave } from "./use-debounced-auto-save"

type SaveCall = {
  value: string
  flush: boolean
  resolve: (result: Result<{ value: string }, string>) => void
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
    options: { flush: boolean }
  ) => Promise<Result<{ value: string }, string>>
  calls: SaveCall[]
} {
  const calls: SaveCall[] = []
  const save = (value: string, options: { flush: boolean }) =>
    new Promise<Result<{ value: string }, string>>((resolve) => {
      calls.push({ value, flush: options.flush, resolve })
    })
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

  it("serializes a follow-up save behind the in-flight one", async () => {
    const { save, calls } = makeControlledSave()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({ serverValue: "", save })
    )

    // Type "A" → wait for debounce → save("A") dispatched.
    act(() => result.current.setValue("A"))
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.value).toBe("A")

    // Type "B" mid-flight → its save chains; nothing dispatched yet.
    act(() => result.current.setValue("B"))
    act(() => vi.advanceTimersByTime(500))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)

    // A settles. Drain microtasks so the chained B fires — in order.
    await act(async () => {
      calls[0]!.resolve(ok({ value: "A" }))
    })
    await flushMicrotasks()

    expect(calls).toHaveLength(2)
    expect(calls[1]!.value).toBe("B")
  })

  it("sibling fields sharing a save queue serialize back-to-back saves (UNN-274)", async () => {
    // Two fields writing the same row are handed one queue (the planner's
    // beat trio), so B's save chains behind A's instead of dispatching
    // alongside it — the row's writes stay in edit order.
    const queue = { current: Promise.resolve() }
    const a = makeControlledSave()
    const b = makeControlledSave()

    const fieldA = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "",
        saveQueueRef: queue,
        save: a.save,
      })
    )
    const fieldB = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "",
        saveQueueRef: queue,
        save: b.save,
      })
    )

    // Blur A, then blur B immediately — A is still in flight.
    act(() => fieldA.result.current.setValue("Aether"))
    act(() => fieldA.result.current.flush())
    act(() => fieldB.result.current.setValue("Archivist"))
    act(() => fieldB.result.current.flush())
    await flushMicrotasks()

    // A has dispatched; B is queued behind it and has NOT dispatched yet.
    expect(a.calls).toHaveLength(1)
    expect(b.calls).toHaveLength(0)

    await act(async () => {
      a.calls[0]!.resolve(ok({ value: "Aether" }))
    })
    await flushMicrotasks()

    // Only now does B dispatch.
    expect(b.calls).toHaveLength(1)
  })

  it("on flush, reverts to last-saved when the draft is empty", async () => {
    const { save, calls } = makeControlledSave()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "Mira",
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
      calls[0]!.resolve(ok({ value: "Iris" }))
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
      useDebouncedAutoSave({ serverValue: "", save })
    )

    // Type within the debounce window — nothing dispatched yet.
    act(() => result.current.setValue("dirty"))
    expect(calls).toHaveLength(0)

    // Unmount before the debounce elapses.
    unmount()
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.value).toBe("dirty")
  })

  it("on unmount, skips the save when the draft is empty", async () => {
    const { save, calls } = makeControlledSave()

    const { result, unmount } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "Mira",
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
    const save = (value: string, options: { flush: boolean }) =>
      new Promise<Result<{ value: string }, string>>((resolve, reject) => {
        calls.push({ value, flush: options.flush, resolve })
        const thisIndex = callIndex++
        // Defer to next microtask so the test can interleave.
        queueMicrotask(() => {
          if (thisIndex === 0) reject(new Error("network down"))
        })
      })

    const { result } = renderHook(() =>
      useDebouncedAutoSave({ serverValue: "Mira", save, onError })
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
      calls[1]!.resolve(ok({ value: "Iris" }))
    })
    await flushMicrotasks()
    expect(result.current.value).toBe("Iris")

    consoleErr.mockRestore()
  })

  it("on failure, rolls the draft back to the last-saved value", async () => {
    const { save, calls } = makeControlledSave()
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({ serverValue: "Mira", save, onError })
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

  it("keepDraftOnError preserves the draft while still surfacing the failure", async () => {
    const { save, calls } = makeControlledSave()
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        serverValue: "Mira",
        save,
        onError,
        keepDraftOnError: true,
      })
    )

    act(() => result.current.setValue("Iris"))
    act(() => result.current.flush())
    await flushMicrotasks()
    await act(async () => {
      calls[0]!.resolve(err("invalid-input"))
    })
    await flushMicrotasks()

    // The paragraph survives the blip; lastSaved is unchanged so the next
    // flush retries.
    expect(result.current.value).toBe("Iris")
    expect(onError).toHaveBeenCalledWith("invalid-input")
  })
})
