// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import type { ApplyCombatantWriteError } from "@/lib/actions/combat/commit/apply-combatant-write.schema"
import type { CommittedWrite } from "@/lib/actions/combat/commit/stores"
import type { ConsoleOptimisticAction } from "@/lib/combat/console-optimistic"
import type { EntityWrite } from "@/lib/entity/commit/write.schema"

import { useCombatantWrite } from "./use-combatant-write"
import type { WriteLane } from "./write-lanes"

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

const participantId = asParticipantId("p-1")
const damage: EntityWrite = { component: "vitals", op: "damage", amount: 2 }

type CommitResult = Result<CommittedWrite, ApplyCombatantWriteError>

function renderWriteHook(
  commit: (write: EntityWrite) => Promise<CommitResult>
) {
  const mirrored: ConsoleOptimisticAction[] = []
  const lane: WriteLane = { commit, channel: null }
  const rendered = renderHook(() =>
    useCombatantWrite({
      laneOf: (id) => (id === participantId ? lane : undefined),
      componentsOf: () => ({ vitals: { base: 20, damage: 0 } }),
      applyOptimistic: (action) => mirrored.push(action),
    })
  )
  return { rendered, mirrored }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("useCombatantWrite", () => {
  it("predicts, mirrors into the container, then commits on the lane", async () => {
    const order: string[] = []
    const commit = vi.fn(async () => {
      order.push("commit")
      return ok({
        version: 6,
        channel: { domain: "encounter" as const, shortId: "enc" },
      })
    })
    const { rendered, mirrored } = renderWriteHook(commit)

    let result: CommitResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        participantId,
        damage
      )
      order.push("resolved")
    })

    expect(result!.ok).toBe(true)
    expect(commit).toHaveBeenCalledWith(damage)
    expect(mirrored).toEqual([{ kind: "write", participantId, write: damage }])
    expect(order).toEqual(["commit", "resolved"])
  })

  it("short-circuits on a Writer refusal without dispatching or mirroring", async () => {
    const commit = vi.fn()
    const { rendered, mirrored } = renderWriteHook(commit)

    let result: CommitResult
    await act(async () => {
      // The frame's components carry no skillPool → capability-missing.
      result = await rendered.result.current.dispatchWrite(participantId, {
        component: "skillPool",
        op: "damage",
        amount: 1,
      })
    })

    expect(result!).toEqual(err("capability-missing"))
    expect(commit).not.toHaveBeenCalled()
    expect(mirrored).toEqual([])
  })

  it("refuses an unknown participant (no lane) before any mirror", async () => {
    const commit = vi.fn()
    const { rendered, mirrored } = renderWriteHook(commit)

    let result: CommitResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        asParticipantId("ghost"),
        damage
      )
    })

    expect(result!).toEqual(err("participant-not-found"))
    expect(commit).not.toHaveBeenCalled()
    expect(mirrored).toEqual([])
  })

  it("returns the lane's failure (already toasted) to the caller", async () => {
    const commit = vi.fn(async () => err("stale" as const))
    const { rendered, mirrored } = renderWriteHook(commit)

    let result: CommitResult
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(
        participantId,
        damage
      )
    })

    expect(result!).toEqual(err("stale"))
    // The optimistic mirror ran — React reverts it when the transition settles.
    expect(mirrored).toHaveLength(1)
  })
})
