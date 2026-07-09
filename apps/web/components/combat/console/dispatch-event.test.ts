// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok } from "@workspace/game-v2/kernel/result"

import { useQueuedWrite } from "@/hooks/use-queued-write"
import { applyCombatEventAction } from "@/lib/actions/combat/apply-event"
import type { ConsoleOptimisticAction } from "@/lib/combat/console-optimistic"

import { dispatchCombatEvent } from "./dispatch-event"

vi.mock("@/lib/actions/combat/apply-event", () => ({
  applyCombatEventAction: vi.fn(),
}))

const applyAction = vi.mocked(applyCombatEventAction)

function renderQueues({
  refetchEncounterVersion,
  refetchInstanceVersion,
}: {
  refetchEncounterVersion?: () => Promise<number | null>
  refetchInstanceVersion?: () => Promise<number | null>
} = {}) {
  return renderHook(() => ({
    encounterWrite: useQueuedWrite({
      serverVersion: 5,
      refetchVersion: refetchEncounterVersion,
    }),
    instanceWrite: useQueuedWrite({
      serverVersion: 9,
      refetchVersion: refetchInstanceVersion,
    }),
  }))
}

const participantId = asParticipantId("p-1")

beforeEach(() => {
  applyAction.mockReset()
})

describe("dispatchCombatEvent", () => {
  it("routes a session event to the encounter queue and mirrors it as an event action", async () => {
    const { result } = renderQueues()
    const mirrored: ConsoleOptimisticAction[] = []
    applyAction.mockResolvedValue(ok({ version: 6 }))

    await act(async () => {
      const dispatched = await dispatchCombatEvent({
        event: { kind: "endTurn" },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current.encounterWrite,
        instanceWrite: result.current.instanceWrite,
      })
      expect(dispatched.ok).toBe(true)
    })

    expect(mirrored).toEqual([{ kind: "event", event: { kind: "endTurn" } }])
    expect(applyAction).toHaveBeenCalledWith({
      encounterId: "enc-1",
      expectedVersion: 5,
      expectedInstanceVersion: 9,
      event: { kind: "endTurn" },
    })
    expect(result.current.encounterWrite.versionRef.current).toBe(6)
    expect(result.current.instanceWrite.versionRef.current).toBe(9)
  })

  it("routes a spatial event to the instance queue without moving the encounter ref", async () => {
    const { result } = renderQueues()
    const mirrored: ConsoleOptimisticAction[] = []
    applyAction.mockResolvedValue(ok({ version: 10 }))

    await act(async () => {
      await dispatchCombatEvent({
        event: { kind: "addZone", name: "Courtyard", zoneId: "z1" },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current.encounterWrite,
        instanceWrite: result.current.instanceWrite,
      })
    })

    expect(mirrored[0]?.kind).toBe("event")
    expect(applyAction).toHaveBeenCalledWith({
      encounterId: "enc-1",
      expectedVersion: 5,
      expectedInstanceVersion: 9,
      event: { kind: "addZone", name: "Courtyard", zoneId: "z1" },
    })
    expect(result.current.instanceWrite.versionRef.current).toBe(10)
    expect(result.current.encounterWrite.versionRef.current).toBe(5)
  })

  it("one-shot retries a stale encounter write with the refetched token", async () => {
    const { result } = renderQueues({
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
        encounterWrite: result.current.encounterWrite,
        instanceWrite: result.current.instanceWrite,
      })
    })

    expect(dispatched).toEqual(ok({ version: 13 }))
    expect(applyAction).toHaveBeenCalledTimes(2)
    expect(applyAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 12 })
    )
    expect(result.current.encounterWrite.versionRef.current).toBe(13)
  })

  it("one-shot retries a stale instance write with the refetched instance token", async () => {
    const { result } = renderQueues({
      refetchInstanceVersion: () => Promise.resolve(20),
    })
    applyAction
      .mockResolvedValueOnce(err("stale"))
      .mockResolvedValueOnce(ok({ version: 21 }))

    await act(async () => {
      await dispatchCombatEvent({
        event: { kind: "moveCombatant", tokenKey: "p-1", toZoneId: "z2" },
        encounterId: "enc-1",
        applyOptimistic: () => {},
        encounterWrite: result.current.encounterWrite,
        instanceWrite: result.current.instanceWrite,
      })
    })

    expect(applyAction).toHaveBeenCalledTimes(2)
    expect(applyAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedInstanceVersion: 20 })
    )
    expect(result.current.instanceWrite.versionRef.current).toBe(21)
  })

  it("folds the returned instance version on a placed add but not a zone-less one", async () => {
    const { result } = renderQueues()
    const mirrored: ConsoleOptimisticAction[] = []
    const entity = { id: "e-1", components: {} }
    applyAction.mockResolvedValue(ok({ version: 6, instanceVersion: 12 }))

    await act(async () => {
      await dispatchCombatEvent({
        event: {
          kind: "addParticipant",
          setup: { id: participantId, side: "enemies", entity, zoneId: "z1" },
        },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current.encounterWrite,
        instanceWrite: result.current.instanceWrite,
      })
    })
    // The paired action reported the bumped Instance row — folded, not assumed.
    expect(result.current.instanceWrite.versionRef.current).toBe(12)
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
        encounterWrite: result.current.encounterWrite,
        instanceWrite: result.current.instanceWrite,
      })
    })
    // Zone-less add: session-only write returns no instanceVersion — the
    // instance ref must not move.
    expect(result.current.instanceWrite.versionRef.current).toBe(12)
    expect(mirrored[1]).toEqual({
      kind: "addPaired",
      setup: { id: participantId, side: "enemies", entity },
      zoneId: undefined,
    })
  })

  it("skips the optimistic mirror for a durable add and still dispatches the wire event", async () => {
    const { result } = renderQueues()
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
        encounterWrite: result.current.encounterWrite,
        instanceWrite: result.current.instanceWrite,
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

  it("folds the returned instance version on removeParticipant (both rows persist)", async () => {
    const { result } = renderQueues()
    const mirrored: ConsoleOptimisticAction[] = []
    applyAction.mockResolvedValue(ok({ version: 6, instanceVersion: 12 }))

    await act(async () => {
      await dispatchCombatEvent({
        event: { kind: "removeParticipant", participantId },
        encounterId: "enc-1",
        applyOptimistic: (action) => mirrored.push(action),
        encounterWrite: result.current.encounterWrite,
        instanceWrite: result.current.instanceWrite,
      })
    })

    expect(mirrored).toEqual([{ kind: "removePaired", participantId }])
    expect(result.current.instanceWrite.versionRef.current).toBe(12)
    expect(result.current.encounterWrite.versionRef.current).toBe(6)
  })
})
