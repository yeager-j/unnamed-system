// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MapGeometry } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import type { SaveMapError, SaveMapInput } from "@/lib/actions/save-map.schema"

import { useMapAutoSave } from "./use-map-autosave"

vi.mock("@/lib/actions/save-map", () => ({ saveMapAction: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

// Imported after the mocks so these bindings are the mocked ones.
const { saveMapAction } = await import("@/lib/actions/save-map")
const { toast } = await import("sonner")

type MapSaveResult = Result<{ version: number }, SaveMapError>

type SaveCall = {
  input: SaveMapInput
  resolve: (result: MapSaveResult) => void
}

/**
 * Installs a manually-controlled `saveMapAction`: each invocation records the
 * `input` it was handed and parks until the test fires its `resolve`, so the
 * serialized-queue races reproduce deterministically without real timers on the
 * network side.
 */
function installControlledSave(): SaveCall[] {
  const calls: SaveCall[] = []
  vi.mocked(saveMapAction).mockImplementation(
    (input: SaveMapInput) =>
      new Promise<MapSaveResult>((resolve) => {
        calls.push({ input, resolve })
      })
  )
  return calls
}

/** The queued save chains through a `.then`, so the request only goes out on the
 *  next microtask. Wrap any assertion about a dispatched call in this. */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

const GEOMETRY_A: MapGeometry = {
  pages: { default: { id: "default", name: "Page 1" } },
  zones: {},
  connections: {},
}
const GEOMETRY_B: MapGeometry = {
  pages: { default: { id: "default", name: "Page 1" } },
  zones: {
    z1: {
      id: "z1",
      name: "Z1",
      description: "",
      dmNotes: "",
      position: { x: 0, y: 0 },
      pageId: "default",
    },
  },
  connections: {},
}

function render(serverVersion = 0) {
  return renderHook(() =>
    useMapAutoSave({
      mapId: "map-1",
      serverName: "Atlas",
      serverGeometry: GEOMETRY_A,
      serverVersion,
    })
  )
}

describe("useMapAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(saveMapAction).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("skips the server call and status flip for a no-op name edit", async () => {
    installControlledSave()
    const { result } = render()

    // Blur with the unchanged name — trimmed value equals last-saved.
    act(() => result.current.name.flush())
    await flushMicrotasks()

    expect(saveMapAction).not.toHaveBeenCalled()
    expect(result.current.save.status).toBe("saved")
  })

  it("skips the server call for a re-saved (unchanged) geometry", async () => {
    installControlledSave()
    const { result } = render()

    act(() => result.current.saveGeometry(GEOMETRY_A))
    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()

    expect(saveMapAction).not.toHaveBeenCalled()
    expect(result.current.save.status).toBe("saved")
  })

  it("reverts the name draft to last-saved on a failed name save", async () => {
    const calls = installControlledSave()
    const { result } = render()

    act(() => result.current.name.onChange("Cartograph"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    expect(result.current.name.value).toBe("Cartograph")
    expect(calls).toHaveLength(1)

    await act(async () => {
      calls[0]!.resolve(err("invalid-input"))
    })
    await flushMicrotasks()

    expect(result.current.name.value).toBe("Atlas")
    expect(result.current.save.status).toBe("error")
  })

  it("keeps geometry edits on failure and self-heals on the next identical save", async () => {
    const calls = installControlledSave()
    const { result } = render()

    // First geometry save fails.
    act(() => result.current.saveGeometry(GEOMETRY_B))
    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    await act(async () => {
      calls[0]!.resolve(err("stale"))
    })
    await flushMicrotasks()
    expect(result.current.save.status).toBe("error")

    // The SAME geometry blob re-dispatches — last-saved was never advanced, so
    // the transient failure self-heals rather than being skipped as a no-op.
    act(() => result.current.saveGeometry(GEOMETRY_B))
    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()
    expect(calls).toHaveLength(2)
  })

  it("toasts the stale-specific copy on a stale failure, generic otherwise", async () => {
    const calls = installControlledSave()
    const { result } = render()

    act(() => result.current.name.onChange("Ley"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    await act(async () => {
      calls[0]!.resolve(err("stale"))
    })
    await flushMicrotasks()
    expect(toast.error).toHaveBeenLastCalledWith(
      "Couldn't sync the map — refresh to see the latest changes."
    )

    act(() => result.current.name.onChange("Rune"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    await act(async () => {
      calls[1]!.resolve(err("map-not-found"))
    })
    await flushMicrotasks()
    expect(toast.error).toHaveBeenLastCalledWith(
      "Couldn't save the map. Try again."
    )
  })

  it("serializes name + geometry on one shared token: the second reads the bumped version", async () => {
    const calls = installControlledSave()
    const { result } = render(0)

    // Blur the name, then immediately queue a geometry save — they share one
    // token and one queue, so the geometry save chains behind the name save.
    act(() => result.current.name.onChange("Meridian"))
    act(() => result.current.name.flush())
    act(() => result.current.saveGeometry(GEOMETRY_B))
    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()

    // Only the name save has dispatched, at the initial version 0.
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input.expectedVersion).toBe(0)
    expect(calls[0]!.input.patch.field).toBe("name")

    // Name succeeds and bumps the shared token to 1.
    await act(async () => {
      calls[0]!.resolve(ok({ version: 1 }))
    })
    await flushMicrotasks()

    // Now geometry dispatches — reading the freshly-bumped version 1, not 0.
    expect(calls).toHaveLength(2)
    expect(calls[1]!.input.expectedVersion).toBe(1)
    expect(calls[1]!.input.patch.field).toBe("geometry")
  })

  it("flushes a pending name and geometry edit on unmount", async () => {
    const calls = installControlledSave()
    const { result, unmount } = render()

    // Both edits are mid-debounce — nothing dispatched yet.
    act(() => result.current.name.onChange("Draft"))
    act(() => result.current.saveGeometry(GEOMETRY_B))
    expect(calls).toHaveLength(0)

    unmount()
    await flushMicrotasks()
    // The name flush dispatches first (chained ahead of geometry).
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input.patch).toEqual({ field: "name", name: "Draft" })

    await act(async () => {
      calls[0]!.resolve(ok({ version: 1 }))
    })
    await flushMicrotasks()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.input.patch.field).toBe("geometry")
  })
})
