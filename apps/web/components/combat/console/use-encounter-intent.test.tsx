// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { EncounterSessionEvent } from "@/domain/combat/replica/mutations"
import type { UseCombatReplicasReturn } from "@/domain/combat/replica/use-combat-replicas"

import { useEncounterIntent } from "./use-encounter-intent"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError } }))

const event = {
  kind: "draftCombatant" as const,
  participantId: "p1" as Extract<
    EncounterSessionEvent,
    { kind: "draftCombatant" }
  >["participantId"],
}

beforeEach(() => toastError.mockReset())

describe("useEncounterIntent", () => {
  it("shows one specific toast for a current-projection refusal", async () => {
    const mutateEncounter = vi.fn(() =>
      err("draft-no-longer-valid")
    ) as unknown as UseCombatReplicasReturn["mutateEncounter"]
    const { result } = renderHook(() =>
      useEncounterIntent({ mutateEncounter, onRemoteVersion: vi.fn() })
    )

    await act(async () => {
      expect(await result.current.dispatchIntent(event)).toEqual(
        err("draft-no-longer-valid")
      )
    })
    expect(toastError).toHaveBeenCalledOnce()
    expect(toastError).toHaveBeenCalledWith(
      "That combatant can no longer take this turn."
    )
  })

  it("waits for a replay conflict's terminal receipt before showing one toast", async () => {
    let settleRemote!: (value: ReturnType<typeof err>) => void
    const remote = new Promise<ReturnType<typeof err>>((resolve) => {
      settleRemote = resolve
    })
    const mutateEncounter = vi.fn(() =>
      ok({ local: Promise.resolve(ok(undefined)), remote })
    ) as unknown as UseCombatReplicasReturn["mutateEncounter"]
    const { result } = renderHook(() =>
      useEncounterIntent({ mutateEncounter, onRemoteVersion: vi.fn() })
    )

    let dispatched!: Promise<unknown>
    act(() => {
      dispatched = result.current.dispatchIntent(event)
    })
    await act(async () => Promise.resolve())
    expect(toastError).not.toHaveBeenCalled()

    await act(async () => {
      settleRemote(
        err({ kind: "rejected" as const, error: "draft-no-longer-valid" })
      )
      await dispatched
    })
    expect(toastError).toHaveBeenCalledOnce()
  })

  it("folds the accepted Remote version into the command-only queue", async () => {
    const onRemoteVersion = vi.fn()
    const mutateEncounter = vi.fn(() =>
      ok({
        local: Promise.resolve(ok(undefined)),
        remote: Promise.resolve(ok({ version: 9 })),
      })
    ) as unknown as UseCombatReplicasReturn["mutateEncounter"]
    const { result } = renderHook(() =>
      useEncounterIntent({ mutateEncounter, onRemoteVersion })
    )

    await act(async () => {
      expect(await result.current.dispatchIntent(event)).toEqual(ok(undefined))
    })
    expect(onRemoteVersion).toHaveBeenCalledWith(9)
    expect(toastError).not.toHaveBeenCalled()
  })
})
