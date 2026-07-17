// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "@workspace/result"

import type { TemplateSetContent } from "@/domain/template-set/authoring"
import type {
  SaveTemplateSetError,
  SaveTemplateSetInput,
} from "@/lib/actions/template-set/save.schema"

import { useTemplateSetAutoSave } from "./use-template-set-autosave"

vi.mock("@/lib/actions/template-set/save", () => ({
  saveTemplateSetAction: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

// Imported after the mocks so these bindings are the mocked ones.
const { saveTemplateSetAction } =
  await import("@/lib/actions/template-set/save")
const { toast } = await import("sonner")

type TemplateSetSaveResult = Result<{ version: number }, SaveTemplateSetError>

type SaveCall = {
  input: SaveTemplateSetInput
  resolve: (result: TemplateSetSaveResult) => void
}

/**
 * Installs a manually-controlled `saveTemplateSetAction`: each invocation records
 * the `input` it was handed and parks until the test fires its `resolve`, so the
 * serialized-queue races reproduce deterministically without real timers on the
 * network side.
 */
function installControlledSave(): SaveCall[] {
  const calls: SaveCall[] = []
  vi.mocked(saveTemplateSetAction).mockImplementation(
    (input: SaveTemplateSetInput) =>
      new Promise<TemplateSetSaveResult>((resolve) => {
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

const CONTENT_B: TemplateSetContent = {
  templates: {
    t1: {
      key: "t1",
      name: "T1",
      description: "",
      dmNotes: "",
      tags: [],
      accepts: [],
      exits: [],
      weight: 1,
      unique: false,
      contentRolls: [],
    },
  },
  tables: {},
  templateOrder: ["t1"],
  tableOrder: [],
  closureChance: 0.1,
}

function render(serverVersion = 0) {
  return renderHook(() =>
    useTemplateSetAutoSave({
      templateSetId: "set-1",
      serverName: "Grammar",
      serverVersion,
    })
  )
}

describe("useTemplateSetAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(saveTemplateSetAction).mockReset()
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

    expect(saveTemplateSetAction).not.toHaveBeenCalled()
    expect(result.current.save.status).toBe("saved")
  })

  it("skips the server call for a re-saved (unchanged) content blob", async () => {
    const calls = installControlledSave()
    const { result } = render()

    // First save dispatches and succeeds, recording last-saved. No `serverContent`
    // is threaded, so the skip primes off this first landed save, not a baseline.
    act(() => result.current.saveContent(CONTENT_B))
    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    await act(async () => {
      calls[0]!.resolve(ok({ version: 1 }))
    })
    await flushMicrotasks()

    // The SAME blob is now a no-op — last-saved matches, so nothing dispatches.
    act(() => result.current.saveContent(CONTENT_B))
    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()

    expect(calls).toHaveLength(1)
    expect(result.current.save.status).toBe("saved")
  })

  it("reverts the name draft to last-saved on a failed name save", async () => {
    const calls = installControlledSave()
    const { result } = render()

    act(() => result.current.name.onChange("Codex"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    expect(result.current.name.value).toBe("Codex")
    expect(calls).toHaveLength(1)

    await act(async () => {
      calls[0]!.resolve(err("invalid-input"))
    })
    await flushMicrotasks()

    expect(result.current.name.value).toBe("Grammar")
    expect(result.current.save.status).toBe("error")
  })

  it("keeps content edits on failure and self-heals on the next identical save", async () => {
    const calls = installControlledSave()
    const { result } = render()

    // First content save fails.
    act(() => result.current.saveContent(CONTENT_B))
    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()
    expect(calls).toHaveLength(1)
    await act(async () => {
      calls[0]!.resolve(err("stale"))
    })
    await flushMicrotasks()
    expect(result.current.save.status).toBe("error")

    // The SAME content blob re-dispatches — last-saved was never advanced, so the
    // transient failure self-heals rather than being skipped as a no-op.
    act(() => result.current.saveContent(CONTENT_B))
    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()
    expect(calls).toHaveLength(2)
  })

  it("toasts the stale-specific copy on a stale failure, generic otherwise", async () => {
    const calls = installControlledSave()
    const { result } = render()

    act(() => result.current.name.onChange("Motif"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    await act(async () => {
      calls[0]!.resolve(err("stale"))
    })
    await flushMicrotasks()
    expect(toast.error).toHaveBeenLastCalledWith(
      "Couldn't sync the set — refresh to see the latest changes."
    )

    act(() => result.current.name.onChange("Weave"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    await act(async () => {
      calls[1]!.resolve(err("template-set-not-found"))
    })
    await flushMicrotasks()
    expect(toast.error).toHaveBeenLastCalledWith(
      "Couldn't save the set. Try again."
    )
  })

  it("serializes name + content on one shared token: the second reads the bumped version", async () => {
    const calls = installControlledSave()
    const { result } = render(0)

    // Blur the name, then immediately queue a content save — they share one token
    // and one queue, so the content save chains behind the name save.
    act(() => result.current.name.onChange("Meridian"))
    act(() => result.current.name.flush())
    act(() => result.current.saveContent(CONTENT_B))
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

    // Now content dispatches — reading the freshly-bumped version 1, not 0.
    expect(calls).toHaveLength(2)
    expect(calls[1]!.input.expectedVersion).toBe(1)
    expect(calls[1]!.input.patch.field).toBe("content")
  })

  it("flushes a pending name and content edit on unmount", async () => {
    const calls = installControlledSave()
    const { result, unmount } = render()

    // Both edits are mid-debounce — nothing dispatched yet.
    act(() => result.current.name.onChange("Draft"))
    act(() => result.current.saveContent(CONTENT_B))
    expect(calls).toHaveLength(0)

    unmount()
    await flushMicrotasks()
    // The name flush dispatches first (chained ahead of content).
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input.patch).toEqual({ field: "name", name: "Draft" })

    await act(async () => {
      calls[0]!.resolve(ok({ version: 1 }))
    })
    await flushMicrotasks()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.input.patch.field).toBe("content")
  })
})
