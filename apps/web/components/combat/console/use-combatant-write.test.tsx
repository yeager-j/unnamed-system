// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { ManagedMutationReceipt } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

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

type Receipt = ManagedMutationReceipt<
  CombatReplicaRejection,
  void,
  CombatBootstrapUnavailableReason
>
type DispatchResult = Result<void, CombatWriteDispatchError> | null

const okReceipt = (): Receipt => ({
  local: Promise.resolve(ok(undefined)),
  remote: Promise.resolve(ok(undefined)),
})

function renderWriteHook(mutate: (write: EntityWrite) => Receipt) {
  const handle: CombatWriteHandle = { channel: null, mutate }
  const rendered = renderHook(() =>
    useCombatantWrite({
      handleOf: (id) => (id === participantId ? handle : undefined),
    })
  )
  return { rendered }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("useCombatantWrite", () => {
  it("mutates immediately, then waits for the receipt to settle", async () => {
    const order: string[] = []
    const mutate = vi.fn((write: EntityWrite) => {
      order.push(`mutate:${write.component}`)
      return okReceipt()
    })
    const { rendered } = renderWriteHook(mutate)

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
    expect(order).toEqual(["mutate:vitals", "resolved"])
  })

  it("refuses an unknown participant before dispatch", async () => {
    const mutate = vi.fn()
    const { rendered } = renderWriteHook(mutate)

    let result: DispatchResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        asParticipantId("ghost"),
        damage
      )
    })

    expect(result!).toEqual(err("participant-not-found"))
    expect(mutate).not.toHaveBeenCalled()
  })

  it("toasts and returns a terminal remote rejection", async () => {
    const { rendered } = renderWriteHook(() => ({
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
    const { rendered } = renderWriteHook(() => {
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
    // a generic toast.
    expect(result).toBeNull()
    expect(toast.error).toHaveBeenCalledWith("Couldn't save. Try again.")
  })
})
