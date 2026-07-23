// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  defineCanon,
  revisionVector,
  type AcceptedStamp,
  type Canon,
  type MutationEnvelope,
  type ProtocolInvocation,
} from "@workspace/headcanon"
import { ok } from "@workspace/result"

import { templateSetContentSchema } from "@/domain/template-set/authoring"
import {
  templateSetProtocol,
  type TemplateSetCanonValue,
} from "@/domain/template-set/commit/protocol"
import { applyTemplateSetMutationAction } from "@/lib/actions/template-set/mutations/apply"
import { templateSetAxis } from "@/lib/db/axes"

import { useTemplateSetAutoSave } from "./use-template-set-autosave"

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }))

vi.mock("@/lib/actions/template-set/mutations/apply", () => ({
  applyTemplateSetMutationAction: vi.fn(),
}))
vi.mock("@/lib/realtime/axis-invalidations", () => ({
  axisInvalidations: {
    initialStatus: "disabled" as const,
    subscribe: () => () => {},
  },
}))
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), dismiss: vi.fn() },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
  unstable_rethrow: () => {},
}))

const door = vi.mocked(applyTemplateSetMutationAction)
const { toast } = await import("sonner")
const axis = templateSetAxis("set-1")

function stampAt(version: number): AcceptedStamp {
  const parsed = revisionVector({ [axis]: version })
  if (!parsed.ok) throw new Error("invalid test stamp")
  return { revisions: parsed.value }
}

type DoorOutcome = Awaited<ReturnType<typeof applyTemplateSetMutationAction>>
type TemplateSetEnvelope = MutationEnvelope<
  ProtocolInvocation<typeof templateSetProtocol>
>

function accepted(version: number): DoorOutcome {
  return ok({ kind: "accepted", stamp: stampAt(version) }) as DoorOutcome
}

function canonAt(
  version = 0,
  value: TemplateSetCanonValue = {
    name: "Grammar",
    content: templateSetContentSchema.parse({}),
  }
): Canon<TemplateSetCanonValue> {
  return defineCanon({ value, revisions: { [axis]: version } })
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function renderTemplateSetHook() {
  const canon = canonAt()
  return renderHook(() =>
    useTemplateSetAutoSave({ templateSetId: "set-1", canon })
  )
}

describe("useTemplateSetAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    door.mockReset()
    vi.mocked(toast.error).mockReset()
    vi.mocked(toast.dismiss).mockReset()
    routerRefresh.mockReset()
  })

  afterEach(() => vi.useRealTimers())

  it("predicts locally and batches serializable events", async () => {
    door.mockResolvedValue(accepted(1))
    const { result } = renderTemplateSetHook()

    act(() => {
      result.current.applyEvent({ kind: "addTemplate", key: "template-a" })
      result.current.applyEvent({
        kind: "updateTemplate",
        key: "template-a",
        patch: { name: "Atrium" },
      })
    })
    expect(result.current.content.templates["template-a"]?.name).toBe("Atrium")

    act(() => vi.advanceTimersByTime(600))
    await flushMicrotasks()

    expect(door).toHaveBeenCalledTimes(1)
    const envelope = door.mock.calls[0]![0] as TemplateSetEnvelope
    expect(envelope.invocation).toMatchObject({
      name: "template-set.events",
      args: {
        templateSetId: "set-1",
        events: [
          { kind: "addTemplate", key: "template-a" },
          {
            kind: "updateTemplate",
            key: "template-a",
            patch: { name: "Atrium" },
          },
        ],
      },
    })
    expect(JSON.stringify(envelope)).not.toMatch(/expectedVersion|content":/)
  })

  it("flushes pending name and events in root order", async () => {
    const outcomes: Array<(outcome: DoorOutcome) => void> = []
    door.mockImplementation(
      () => new Promise<DoorOutcome>((resolve) => outcomes.push(resolve))
    )
    const { result } = renderTemplateSetHook()

    act(() => result.current.name.onChange("Codex"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    act(() => {
      result.current.applyEvent({ kind: "addTable", key: "table-a" })
      vi.advanceTimersByTime(600)
    })
    await flushMicrotasks()
    await flushMicrotasks()

    expect(door).toHaveBeenCalledTimes(1)
    expect(
      (door.mock.calls[0]![0] as TemplateSetEnvelope).invocation.name
    ).toBe("template-set.rename")

    await act(async () => outcomes[0]!(accepted(1)))
    await flushMicrotasks()
    expect(door).toHaveBeenCalledTimes(2)
    expect(
      (door.mock.calls[1]![0] as TemplateSetEnvelope).invocation.name
    ).toBe("template-set.events")
  })

  it("flushes a pending event batch on unmount", async () => {
    door.mockResolvedValue(accepted(1))
    const { result, unmount } = renderTemplateSetHook()

    act(() =>
      result.current.applyEvent({ kind: "addTemplate", key: "template-a" })
    )
    unmount()
    await flushMicrotasks()

    expect(door).toHaveBeenCalledTimes(1)
  })

  it("hands accepted events to a covering canon without dropping the edit", async () => {
    door.mockResolvedValue(accepted(1))
    const { result, rerender } = renderHook(
      ({ canon }) => useTemplateSetAutoSave({ templateSetId: "set-1", canon }),
      { initialProps: { canon: canonAt() } }
    )

    act(() => {
      result.current.applyEvent({ kind: "addTemplate", key: "template-a" })
      vi.advanceTimersByTime(600)
    })
    await flushMicrotasks()

    const content = templateSetContentSchema.parse({
      templates: {
        "template-a": { key: "template-a", name: "New template" },
      },
      templateOrder: ["template-a"],
    })
    rerender({ canon: canonAt(1, { name: "Grammar", content }) })
    await flushMicrotasks()

    expect(result.current.content.templates["template-a"]).toBeDefined()
    expect(result.current.save.lastSavedAt).not.toBeNull()
  })

  it("surfaces uncertain delivery with an actionable retry", async () => {
    door.mockRejectedValue(new Error("connection lost"))
    const { result } = renderTemplateSetHook()

    act(() => result.current.name.onChange("Codex"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    await flushMicrotasks()

    expect(toast.error).toHaveBeenCalledWith(
      "Connection lost mid-save — your set change is kept.",
      expect.objectContaining({
        duration: Infinity,
        action: expect.objectContaining({ label: "Retry" }),
      })
    )
  })
})
