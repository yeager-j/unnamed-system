// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "@workspace/game/foundation/result"

import { getCharacterVersionsAction } from "../lib/actions/character-versions"
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
  surface: "name" as const,
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
    const versionRef = { current: 0 }

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "",
        versionRef,
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

  it("sibling fields sharing a versionRef see each other's bump in-frame (UNN-274)", async () => {
    // Two same-class fields (e.g. Ancestry + Background) are handed the *same*
    // provider ref. After field A's save bumps it to v1, field B's next save
    // must read v1 — not the stale v0 it loaded with — so it never stales.
    const shared = { current: 0 }
    const a = makeControlledSave()
    const b = makeControlledSave()

    const fieldA = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "",
        versionRef: shared,
        save: a.save,
      })
    )
    const fieldB = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "",
        versionRef: shared,
        save: b.save,
      })
    )

    // A saves and the server advances to v1.
    act(() => fieldA.result.current.setValue("Aether"))
    act(() => fieldA.result.current.flush())
    await flushMicrotasks()
    expect(a.calls[0]!.expectedVersion).toBe(0)
    await act(async () => {
      a.calls[0]!.resolve(ok({ value: "Aether", version: 1 }))
    })
    await flushMicrotasks()

    // B now saves — it reads the shared ref, already advanced to v1.
    act(() => fieldB.result.current.setValue("Archivist"))
    act(() => fieldB.result.current.flush())
    await flushMicrotasks()
    expect(b.calls[0]!.expectedVersion).toBe(1)
  })

  it("sibling fields sharing a save queue serialize back-to-back saves (UNN-274)", async () => {
    // The real lost-update case: two same-class fields blurred back-to-back,
    // faster than a round-trip. With a *shared* queue (the provider hands one
    // per class), B's save chains behind A's instead of dispatching alongside
    // it at the stale token — so B reads the version A's success just bumped,
    // and neither stales. Without serialization both would dispatch at v0,
    // collide, and the second would lose its update.
    const shared = { current: 0 }
    const queue = { current: Promise.resolve() }
    const a = makeControlledSave()
    const b = makeControlledSave()

    const fieldA = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "",
        versionRef: shared,
        saveQueueRef: queue,
        save: a.save,
      })
    )
    const fieldB = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "",
        versionRef: shared,
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
    expect(a.calls[0]!.expectedVersion).toBe(0)
    expect(b.calls).toHaveLength(0)

    // A succeeds and bumps the shared ref to v1.
    await act(async () => {
      a.calls[0]!.resolve(ok({ value: "Aether", version: 1 }))
    })
    await flushMicrotasks()

    // Only now does B dispatch — and it reads the freshly-bumped v1.
    expect(b.calls).toHaveLength(1)
    expect(b.calls[0]!.expectedVersion).toBe(1)
  })

  it("on flush, reverts to last-saved when the draft is empty", async () => {
    const { save, calls } = makeControlledSave()
    const versionRef = { current: 0 }

    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        versionRef,
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
    const versionRef = { current: 0 }

    const { result, unmount } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "",
        versionRef,
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
    const versionRef = { current: 0 }

    const { result, unmount } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        versionRef,
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

    const versionRef = { current: 0 }
    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        versionRef,
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

    const versionRef = { current: 0 }
    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        versionRef,
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

    const versionRef = { current: 0 }
    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        versionRef,
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

    const versionRef = { current: 0 }
    const { result } = renderHook(() =>
      useDebouncedAutoSave({
        ...FIXED_ARGS,
        serverValue: "Mira",
        versionRef,
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
