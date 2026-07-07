// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok } from "@workspace/game/foundation"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"
import { useQueuedWrite } from "@/hooks/use-queued-write"
import { useMonotonicVersionMap } from "@/hooks/version-token-store"
import { applyCombatantWriteAction } from "@/lib/actions/combat/commit/apply-combatant-write"
import { getCombatantVitalsVersionAction } from "@/lib/actions/combat/vitals-version"
import type { ConsoleOptimisticAction } from "@/lib/combat/console-optimistic"
import type { EntityWrite } from "@/lib/entity/commit/write.schema"

import { useCombatantWrite } from "./use-combatant-write"

vi.mock("@/lib/actions/combat/commit/apply-combatant-write", () => ({
  applyCombatantWriteAction: vi.fn(),
}))
vi.mock("@/lib/actions/combat/vitals-version", () => ({
  getCombatantVitalsVersionAction: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

const writeAction = vi.mocked(applyCombatantWriteAction)
const versionAction = vi.mocked(getCombatantVitalsVersionAction)

const inlineId = asParticipantId("p-inline")
const durableId = asParticipantId("p-durable")

const META: Record<string, ParticipantMeta> = {
  [inlineId]: { storage: "inline" },
  [durableId]: {
    storage: "durable",
    characterId: "char-1",
    vitalsVersion: 3,
    characterShortId: "abc123",
  },
}

const damage: EntityWrite = { component: "vitals", op: "damage", amount: 2 }

function renderWriteHook() {
  const mirrored: ConsoleOptimisticAction[] = []
  const rendered = renderHook(() => {
    const encounterWrite = useQueuedWrite({ serverVersion: 5 })
    const characterVersions = useMonotonicVersionMap<string>()
    const { dispatchWrite } = useCombatantWrite({
      encounterId: "enc-1",
      encounterWrite,
      characterVersions,
      metaOf: (id) => META[id],
      componentsOf: () => ({ vitals: { base: 20, damage: 0 } }),
      applyOptimistic: (action) => mirrored.push(action),
    })
    return { encounterWrite, characterVersions, dispatchWrite }
  })
  return { rendered, mirrored }
}

beforeEach(() => {
  writeAction.mockReset()
  versionAction.mockReset()
})

describe("useCombatantWrite", () => {
  it("routes an inline write through the encounter queue and folds the encounter version", async () => {
    const { rendered, mirrored } = renderWriteHook()
    writeAction.mockResolvedValue(
      ok({ version: 6, channel: { domain: "encounter", shortId: "enc" } })
    )

    await act(async () => {
      await rendered.result.current.dispatchWrite(inlineId, damage)
    })

    expect(writeAction).toHaveBeenCalledWith({
      encounterId: "enc-1",
      expectedVersion: 5,
      participantId: inlineId,
      write: damage,
    })
    expect(rendered.result.current.encounterWrite.versionRef.current).toBe(6)
    expect(mirrored).toEqual([
      { kind: "write", participantId: inlineId, write: damage },
    ])
  })

  it("routes a durable write with the character token and never touches the encounter ref", async () => {
    const { rendered } = renderWriteHook()
    writeAction.mockResolvedValue(
      ok({ version: 4, channel: { domain: "character", shortId: "abc123" } })
    )

    await act(async () => {
      await rendered.result.current.dispatchWrite(durableId, damage)
    })

    expect(writeAction).toHaveBeenCalledWith({
      encounterId: "enc-1",
      expectedVersion: 5,
      expectedCharacterVersion: 3,
      participantId: durableId,
      write: damage,
    })
    // The committed version is the character vitalsVersion — it folds into the
    // character map, not the encounter queue's ref.
    expect(rendered.result.current.encounterWrite.versionRef.current).toBe(5)
    expect(rendered.result.current.characterVersions.read("char-1")).toBe(4)
  })

  it("serializes back-to-back durable writes so the second reads the bumped token", async () => {
    const { rendered } = renderWriteHook()
    writeAction
      .mockResolvedValueOnce(
        ok({ version: 4, channel: { domain: "character", shortId: "abc123" } })
      )
      .mockResolvedValueOnce(
        ok({ version: 5, channel: { domain: "character", shortId: "abc123" } })
      )

    await act(async () => {
      await Promise.all([
        rendered.result.current.dispatchWrite(durableId, damage),
        rendered.result.current.dispatchWrite(durableId, damage),
      ])
    })

    expect(writeAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ expectedCharacterVersion: 3 })
    )
    expect(writeAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedCharacterVersion: 4 })
    )
  })

  it("one-shot retries a stale durable write with the refetched vitals version", async () => {
    const { rendered } = renderWriteHook()
    writeAction
      .mockResolvedValueOnce(err("stale"))
      .mockResolvedValueOnce(
        ok({ version: 9, channel: { domain: "character", shortId: "abc123" } })
      )
    versionAction.mockResolvedValue(ok({ version: 8 }))

    let result: Awaited<
      ReturnType<typeof rendered.result.current.dispatchWrite>
    >
    await act(async () => {
      result = await rendered.result.current.dispatchWrite(durableId, damage)
    })

    expect(result!.ok).toBe(true)
    expect(versionAction).toHaveBeenCalledWith({ characterId: "char-1" })
    expect(writeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedCharacterVersion: 8 })
    )
    expect(rendered.result.current.characterVersions.read("char-1")).toBe(9)
  })

  it("short-circuits on a Writer refusal without dispatching or mirroring", async () => {
    const { rendered, mirrored } = renderWriteHook()

    let result: Awaited<
      ReturnType<typeof rendered.result.current.dispatchWrite>
    >
    await act(async () => {
      // The frame's components carry no skillPool → capability-missing.
      result = await rendered.result.current.dispatchWrite(inlineId, {
        component: "skillPool",
        op: "damage",
        amount: 1,
      })
    })

    expect(result!).toEqual(err("capability-missing"))
    expect(writeAction).not.toHaveBeenCalled()
    expect(mirrored).toEqual([])
  })
})
