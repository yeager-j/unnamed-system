// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok } from "@workspace/result"

import type { ConsoleOptimisticAction } from "@/domain/combat/console-optimistic"
import { applyCombatEventAction } from "@/lib/actions/combat/apply-event"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"

import { dispatchCombatEvent } from "./dispatch-event"

vi.mock("@/lib/actions/combat/apply-event", () => ({
  applyCombatEventAction: vi.fn(),
}))

const applyAction = vi.mocked(applyCombatEventAction)

function renderQueue({
  refetchEncounterVersion,
}: {
  refetchEncounterVersion?: () => Promise<number | null>
} = {}) {
  return renderHook(() =>
    useQueuedWrite({
      serverVersion: 5,
      refetchVersion: refetchEncounterVersion,
    })
  )
}

const participantId = asParticipantId("p-1")

beforeEach(() => {
  applyAction.mockReset()
})

describe("dispatchCombatEvent", () => {
  it("routes a session event to the encounter queue and mirrors it as an event action", async () => {
    const { result } = renderQueue()
    const mirrored: ConsoleOptimisticAction[] = []
    applyAction.mockResolvedValue(ok({ version: 6 }))

    await act(async () => {
      const dispatched = await dispatchCombatEvent({
        event: { kind: "endTurn" },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current,
      })
      expect(dispatched.ok).toBe(true)
    })

    expect(mirrored).toEqual([{ kind: "event", event: { kind: "endTurn" } }])
    expect(applyAction).toHaveBeenCalledWith({
      encounterId: "enc-1",
      expectedVersion: 5,
      event: { kind: "endTurn" },
    })
    expect(result.current.versionRef.current).toBe(6)
  })

  it("one-shot retries a stale encounter write with the refetched token", async () => {
    const { result } = renderQueue({
      refetchEncounterVersion: () => Promise.resolve(12),
    })
    applyAction
      .mockResolvedValueOnce(err("stale"))
      .mockResolvedValueOnce(ok({ version: 13 }))

    let dispatched: Awaited<ReturnType<typeof dispatchCombatEvent>> | undefined
    await act(async () => {
      dispatched = await dispatchCombatEvent({
        event: { kind: "endTurn" },
        encounterId: "enc-1",
        applyOptimistic: () => {},
        encounterWrite: result.current,
      })
    })

    expect(dispatched).toEqual(ok({ version: 13 }))
    expect(applyAction).toHaveBeenCalledTimes(2)
    expect(applyAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 12 })
    )
    expect(result.current.versionRef.current).toBe(13)
  })

  it("returns the map invalidation version on a placed add but not a zone-less one", async () => {
    const { result } = renderQueue()
    const mirrored: ConsoleOptimisticAction[] = []
    const entity = { id: "e-1", components: {} }
    applyAction.mockResolvedValue(ok({ version: 6, instanceVersion: 12 }))

    await act(async () => {
      const dispatched = await dispatchCombatEvent({
        event: {
          kind: "addParticipant",
          setup: { id: participantId, side: "enemies", entity, zoneId: "z1" },
        },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current,
      })
      expect(dispatched).toEqual(ok({ version: 6, instanceVersion: 12 }))
    })
    expect(mirrored).toEqual([
      {
        kind: "addPaired",
        setup: { id: participantId, side: "enemies", entity },
        zoneId: "z1",
      },
    ])

    applyAction.mockResolvedValue(ok({ version: 7 }))
    await act(async () => {
      await dispatchCombatEvent({
        event: {
          kind: "addParticipant",
          setup: { id: participantId, side: "enemies", entity },
        },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current,
      })
    })
    expect(mirrored[1]).toEqual({
      kind: "addPaired",
      setup: { id: participantId, side: "enemies", entity },
      zoneId: undefined,
    })
  })

  it("skips the optimistic mirror for a durable add and still dispatches the wire event", async () => {
    const { result } = renderQueue()
    const mirrored: ConsoleOptimisticAction[] = []
    applyAction.mockResolvedValue(ok({ version: 6 }))

    await act(async () => {
      await dispatchCombatEvent({
        event: {
          kind: "addParticipant",
          setup: { id: participantId, side: "players", entityId: "char-1" },
        },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current,
      })
    })

    expect(mirrored).toEqual([])
    expect(applyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          kind: "addParticipant",
          setup: { id: participantId, side: "players", entityId: "char-1" },
        },
      })
    )
  })

  it("returns the map invalidation version on removeParticipant", async () => {
    const { result } = renderQueue()
    const mirrored: ConsoleOptimisticAction[] = []
    applyAction.mockResolvedValue(ok({ version: 6, instanceVersion: 12 }))

    await act(async () => {
      const dispatched = await dispatchCombatEvent({
        event: { kind: "removeParticipant", participantId },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current,
      })
      expect(dispatched).toEqual(ok({ version: 6, instanceVersion: 12 }))
    })

    expect(mirrored).toEqual([{ kind: "removePaired", participantId }])
    expect(result.current.versionRef.current).toBe(6)
  })
})
