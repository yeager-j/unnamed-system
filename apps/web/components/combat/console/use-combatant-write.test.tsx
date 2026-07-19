// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { ManagedMutationReceipt } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { ConsoleOptimisticAction } from "@/domain/combat/console-optimistic"
import type {
  CombatReplicaRejection,
  CombatWriteDispatchError,
} from "@/domain/combat/replica/rejection"
import type {
  CombatBootstrapUnavailableReason,
  CombatWriteHandle,
} from "@/domain/combat/replica/use-combat-replicas"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"

import { useCombatantWrite } from "./use-combatant-write"

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

const participantId = asParticipantId("p-1")
const damage: EntityWrite = { component: "vitals", op: "damage", amount: 2 }

type Remote = { version: number } | void
type Receipt = ManagedMutationReceipt<
  CombatReplicaRejection,
  Remote,
  CombatBootstrapUnavailableReason
>
type DispatchResult = Result<void, CombatWriteDispatchError> | null

const okReceipt = (remote: Remote = undefined): Receipt => ({
  local: Promise.resolve(ok(undefined)),
  remote: Promise.resolve(ok(remote)),
})

function renderWriteHook(
  mutate: (write: EntityWrite) => Receipt,
  onRemoteVersion?: (version: number) => void
) {
  const mirrored: ConsoleOptimisticAction[] = []
  const handle: CombatWriteHandle = { channel: null, mutate }
  const rendered = renderHook(() =>
    useCombatantWrite({
      handleOf: (id) => (id === participantId ? handle : undefined),
      componentsOf: () => ({ vitals: { base: 20, damage: 0 } }),
      applyOptimistic: (action) => mirrored.push(action),
      onRemoteVersion,
    })
  )
  return { rendered, mirrored }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("useCombatantWrite", () => {
  it("predicts, mirrors into the container, then holds the transition until remote settles", async () => {
    const order: string[] = []
    const mutate = vi.fn((write: EntityWrite) => {
      order.push(`mutate:${write.component}`)
      return okReceipt()
    })
    const { rendered, mirrored } = renderWriteHook(mutate)

    let result: DispatchResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        participantId,
        damage
      )
      order.push("resolved")
    })

    expect(result!).toEqual(ok(undefined))
    expect(mutate).toHaveBeenCalledWith(damage)
    expect(mirrored).toEqual([{ kind: "write", participantId, write: damage }])
    expect(order).toEqual(["mutate:vitals", "resolved"])
  })

  it("folds the inline door's committed version into onRemoteVersion", async () => {
    const versions: number[] = []
    const { rendered } = renderWriteHook(
      () => okReceipt({ version: 12 }),
      (version) => versions.push(version)
    )

    await act(async () => {
      await rendered.result.current.dispatchWrite(participantId, damage)
    })

    expect(versions).toEqual([12])
  })

  it("short-circuits on a Writer refusal without dispatching or mirroring", async () => {
    const mutate = vi.fn()
    const { rendered, mirrored } = renderWriteHook(mutate)

    let result: DispatchResult
    await act(async () => {
      // The frame's components carry no skillPool → capability-missing.
      result = await rendered.result.current.dispatchWrite(participantId, {
        component: "skillPool",
        op: "damage",
        amount: 1,
      })
    })

    expect(result!).toEqual(err("capability-missing"))
    expect(mutate).not.toHaveBeenCalled()
    expect(mirrored).toEqual([])
  })

  it("refuses an unknown participant (no handle) before any mirror", async () => {
    const mutate = vi.fn()
    const { rendered, mirrored } = renderWriteHook(mutate)

    let result: DispatchResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        asParticipantId("ghost"),
        damage
      )
    })

    expect(result!).toEqual(err("participant-not-found"))
    expect(mutate).not.toHaveBeenCalled()
    expect(mirrored).toEqual([])
  })

  it("toasts and returns a terminal remote rejection", async () => {
    const { rendered, mirrored } = renderWriteHook(() => ({
      local: Promise.resolve(ok(undefined)),
      remote: Promise.resolve(err({ kind: "rejected", error: "forbidden" })),
    }))

    let result: DispatchResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        participantId,
        damage
      )
    })

    expect(result!).toEqual(err("forbidden"))
    expect(toast.error).toHaveBeenCalled()
    // The optimistic mirror ran — React reverts it when the transition settles.
    expect(mirrored).toHaveLength(1)
  })

  it("returns a local replica refusal (base disagrees with the frame) with its toast", async () => {
    const refused = Promise.resolve(
      err({ kind: "refused" as const, error: "capability-missing" as const })
    )
    const { rendered } = renderWriteHook(() => ({
      local: refused,
      remote: refused,
    }))

    let result: DispatchResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        participantId,
        damage
      )
    })

    expect(result!).toEqual(err("capability-missing"))
    expect(toast.error).toHaveBeenCalled()
  })

  it("stays quiet on a disposed/expired replica — the write-unavailable arm", async () => {
    const unavailable = Promise.resolve(err({ kind: "expired" as const }))
    const { rendered } = renderWriteHook(() => ({
      local: unavailable,
      remote: unavailable,
    }))

    let result: DispatchResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        participantId,
        damage
      )
    })

    expect(result!).toEqual(err("write-unavailable"))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("catches a thrown mutate (programmer bug): toasts and resolves to null", async () => {
    const { rendered, mirrored } = renderWriteHook(() => {
      throw new Error("registry mismatch")
    })

    let result: DispatchResult = ok(undefined)
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        participantId,
        damage
      )
    })

    // A throw doesn't escape to the route boundary — it resolves to null with
    // a generic toast, and the optimistic mirror (which ran before the
    // dispatch) reverts when the transition settles.
    expect(result).toBeNull()
    expect(toast.error).toHaveBeenCalledWith("Couldn't save. Try again.")
    expect(mirrored).toHaveLength(1)
  })
})
