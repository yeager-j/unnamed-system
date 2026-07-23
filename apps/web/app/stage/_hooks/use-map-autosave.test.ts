// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  mapGeometrySchema,
  reduceMapGeometry,
} from "@workspace/game-v2/spatial"
import {
  defineCanon,
  revisionVector,
  type AcceptedStamp,
  type Canon,
  type MutationEnvelope,
  type ProtocolInvocation,
} from "@workspace/headcanon"
import { ok } from "@workspace/result"

import { mapProtocol, type MapCanonValue } from "@/domain/map/commit/protocol"
import { applyMapMutationAction } from "@/lib/actions/map/mutations/apply"
import { mapAxis } from "@/lib/db/axes"

import { useMapAutoSave } from "./use-map-autosave"

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }))

vi.mock("@/lib/actions/map/mutations/apply", () => ({
  applyMapMutationAction: vi.fn(),
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

const door = vi.mocked(applyMapMutationAction)
const { toast } = await import("sonner")
const axis = mapAxis("map-1")

function stampAt(version: number): AcceptedStamp {
  const parsed = revisionVector({ [axis]: version })
  if (!parsed.ok) throw new Error("invalid test stamp")
  return { revisions: parsed.value }
}

type DoorOutcome = Awaited<ReturnType<typeof applyMapMutationAction>>
type MapEnvelope = MutationEnvelope<ProtocolInvocation<typeof mapProtocol>>

function accepted(version: number): DoorOutcome {
  return ok({ kind: "accepted", stamp: stampAt(version) }) as DoorOutcome
}

function canonAt(
  version = 0,
  value: MapCanonValue = {
    name: "Atlas",
    geometry: mapGeometrySchema.parse({}),
  }
): Canon<MapCanonValue> {
  return defineCanon({ value, revisions: { [axis]: version } })
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function renderMapHook() {
  const canon = canonAt()
  return renderHook(() => useMapAutoSave({ mapId: "map-1", canon }))
}

describe("useMapAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    door.mockReset()
    vi.mocked(toast.error).mockReset()
    vi.mocked(toast.dismiss).mockReset()
    routerRefresh.mockReset()
  })

  afterEach(() => vi.useRealTimers())

  it("skips an unchanged name on blur", async () => {
    const { result } = renderMapHook()

    act(() => result.current.name.flush())
    await flushMicrotasks()

    expect(door).not.toHaveBeenCalled()
    expect(result.current.save.status).toBe("saved")
  })

  it("batches geometry events into one intent-only mutation", async () => {
    door.mockResolvedValue(accepted(1))
    const { result } = renderMapHook()

    act(() => {
      result.current.saveGeometryEvent({
        kind: "addZone",
        id: "z1",
        pageId: "default",
        position: { x: 0, y: 0 },
      })
      result.current.saveGeometryEvent({
        kind: "renameZone",
        zoneId: "z1",
        name: "Atrium",
      })
      vi.advanceTimersByTime(600)
    })
    await flushMicrotasks()

    expect(door).toHaveBeenCalledTimes(1)
    const envelope = door.mock.calls[0]![0] as MapEnvelope
    expect(envelope.invocation).toEqual({
      name: "map.geometry-events",
      args: {
        mapId: "map-1",
        events: [
          {
            kind: "addZone",
            id: "z1",
            pageId: "default",
            position: { x: 0, y: 0 },
          },
          { kind: "renameZone", zoneId: "z1", name: "Atrium" },
        ],
      },
    })
    expect(JSON.stringify(envelope)).not.toMatch(/expectedVersion|geometry":/)
    expect(result.current.geometry.zones.z1?.name).toBe("Atrium")
  })

  it("replays a still-debounced local event over an incoming canon", async () => {
    const { result, rerender } = renderHook(
      ({ canon }) => useMapAutoSave({ mapId: "map-1", canon }),
      { initialProps: { canon: canonAt() } }
    )

    act(() =>
      result.current.saveGeometryEvent({
        kind: "addZone",
        id: "local",
        pageId: "default",
        position: { x: 0, y: 0 },
      })
    )
    const remoteGeometry = reduceMapGeometry(mapGeometrySchema.parse({}), {
      kind: "addZone",
      id: "remote",
      pageId: "default",
      position: { x: 10, y: 10 },
    })
    rerender({ canon: canonAt(1, { name: "Atlas", geometry: remoteGeometry }) })
    await flushMicrotasks()

    expect(Object.keys(result.current.geometry.zones).sort()).toEqual([
      "local",
      "remote",
    ])
  })

  it("orders name and geometry through one root and hands off to accepted canon", async () => {
    const outcomes: Array<(outcome: DoorOutcome) => void> = []
    door.mockImplementation(
      () => new Promise<DoorOutcome>((resolve) => outcomes.push(resolve))
    )
    const { result, rerender } = renderHook(
      ({ canon }) => useMapAutoSave({ mapId: "map-1", canon }),
      { initialProps: { canon: canonAt() } }
    )

    act(() => result.current.name.onChange("Meridian"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    act(() => {
      result.current.saveGeometryEvent({
        kind: "addZone",
        id: "z1",
        pageId: "default",
        position: { x: 0, y: 0 },
      })
      vi.advanceTimersByTime(600)
    })
    await flushMicrotasks()

    expect(door).toHaveBeenCalledTimes(1)
    expect((door.mock.calls[0]![0] as MapEnvelope).invocation.name).toBe(
      "map.rename"
    )

    await act(async () => outcomes[0]!(accepted(1)))
    await flushMicrotasks()
    expect(door).toHaveBeenCalledTimes(2)
    expect((door.mock.calls[1]![0] as MapEnvelope).invocation.name).toBe(
      "map.geometry-events"
    )

    const geometry = reduceMapGeometry(mapGeometrySchema.parse({}), {
      kind: "addZone",
      id: "z1",
      pageId: "default",
      position: { x: 0, y: 0 },
    })
    await act(async () => outcomes[1]!(accepted(2)))
    rerender({ canon: canonAt(2, { name: "Meridian", geometry }) })
    await flushMicrotasks()

    expect(result.current.name.value).toBe("Meridian")
    expect(result.current.save.lastSavedAt).not.toBeNull()
  })

  it("flushes a pending geometry batch on unmount", async () => {
    door.mockResolvedValue(accepted(1))
    const { result, unmount } = renderMapHook()

    act(() =>
      result.current.saveGeometryEvent({
        kind: "addZone",
        id: "z1",
        pageId: "default",
        position: { x: 0, y: 0 },
      })
    )
    unmount()
    await flushMicrotasks()

    expect(door).toHaveBeenCalledTimes(1)
  })

  it("surfaces uncertain delivery with an actionable retry", async () => {
    door.mockRejectedValue(new Error("connection lost"))
    const { result } = renderMapHook()

    act(() => result.current.name.onChange("Meridian"))
    act(() => result.current.name.flush())
    await flushMicrotasks()
    await flushMicrotasks()

    expect(toast.error).toHaveBeenCalledWith(
      "Connection lost mid-save — your map change is kept.",
      expect.objectContaining({
        duration: Infinity,
        action: expect.objectContaining({ label: "Retry" }),
      })
    )
  })
})
