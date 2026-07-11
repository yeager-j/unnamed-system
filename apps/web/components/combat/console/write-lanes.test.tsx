// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok } from "@workspace/game-v2/kernel/result"

import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { applyCombatantWriteAction } from "@/lib/actions/combat/commit/apply-combatant-write"
import { getEntityClassVersionAction } from "@/lib/actions/entity/versions"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"

import { useCombatantLanes } from "./write-lanes"

vi.mock("@/lib/actions/combat/commit/apply-combatant-write", () => ({
  applyCombatantWriteAction: vi.fn(),
}))
vi.mock("@/lib/actions/entity/versions", () => ({
  getEntityClassVersionAction: vi.fn(),
}))

const writeAction = vi.mocked(applyCombatantWriteAction)
const versionAction = vi.mocked(getEntityClassVersionAction)

const inlineId = asParticipantId("p-inline")
const durableId = asParticipantId("p-durable")
const durableTwinId = asParticipantId("p-durable-twin")

const META: Record<string, ParticipantMeta> = {
  [inlineId]: { storage: "inline" },
  [durableId]: {
    storage: "durable",
    characterId: "char-1",
    vitalsVersion: 3,
    characterShortId: "abc123",
  },
  [durableTwinId]: {
    storage: "durable",
    characterId: "char-1",
    vitalsVersion: 3,
    characterShortId: "abc123",
  },
}

const damage: EntityWrite = { component: "vitals", op: "damage", amount: 2 }

function renderLanes(rosterIds = [inlineId, durableId]) {
  const onFresher = vi.fn()
  const rendered = renderHook(() => {
    const encounterWrite = useQueuedWrite({ serverVersion: 5 })
    const lanes = useCombatantLanes({
      encounterId: "enc-1",
      encounterWrite,
      participantMeta: META,
      rosterIds,
      onFresher,
    })
    return { encounterWrite, lanes }
  })
  return { rendered, onFresher }
}

beforeEach(() => {
  writeAction.mockReset()
  versionAction.mockReset()
})

describe("useCombatantLanes — per-arm envelopes (UNN-567)", () => {
  it("an inline lane rides the encounter queue and sends only the encounter token", async () => {
    const { rendered } = renderLanes()
    writeAction.mockResolvedValue(
      ok({ version: 6, channel: { domain: "encounter", shortId: "enc" } })
    )

    await act(async () => {
      await rendered.result.current.lanes.laneOf(inlineId)!.commit(damage)
    })

    expect(writeAction).toHaveBeenCalledWith({
      encounterId: "enc-1",
      expectedVersion: 5,
      participantId: inlineId,
      write: damage,
    })
    // The committed encounter version folds into the encounter queue's ref.
    expect(rendered.result.current.encounterWrite.versionRef.current).toBe(6)
  })

  it("a durable lane sends only the character token and never touches the encounter ref", async () => {
    const { rendered } = renderLanes()
    writeAction.mockResolvedValue(
      ok({ version: 4, channel: { domain: "character", shortId: "abc123" } })
    )

    await act(async () => {
      await rendered.result.current.lanes.laneOf(durableId)!.commit(damage)
    })

    expect(writeAction).toHaveBeenCalledWith({
      encounterId: "enc-1",
      expectedCharacterVersion: 3,
      participantId: durableId,
      write: damage,
    })
    expect(rendered.result.current.encounterWrite.versionRef.current).toBe(5)
  })

  it("returns undefined for a participant with no meta", () => {
    const { rendered } = renderLanes()
    expect(
      rendered.result.current.lanes.laneOf(asParticipantId("ghost"))
    ).toBeUndefined()
  })
})

describe("useCombatantLanes — the per-character queue", () => {
  it("serializes back-to-back durable writes so the second reads the bumped token", async () => {
    const { rendered } = renderLanes()
    writeAction
      .mockResolvedValueOnce(
        ok({ version: 4, channel: { domain: "character", shortId: "abc123" } })
      )
      .mockResolvedValueOnce(
        ok({ version: 5, channel: { domain: "character", shortId: "abc123" } })
      )

    await act(async () => {
      const lane = rendered.result.current.lanes.laneOf(durableId)!
      await Promise.all([lane.commit(damage), lane.commit(damage)])
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

  it("two roster slots holding one character share a queue (token continuity)", async () => {
    const { rendered } = renderLanes([durableId, durableTwinId])
    writeAction
      .mockResolvedValueOnce(
        ok({ version: 4, channel: { domain: "character", shortId: "abc123" } })
      )
      .mockResolvedValueOnce(
        ok({ version: 5, channel: { domain: "character", shortId: "abc123" } })
      )

    await act(async () => {
      await Promise.all([
        rendered.result.current.lanes.laneOf(durableId)!.commit(damage),
        rendered.result.current.lanes.laneOf(durableTwinId)!.commit(damage),
      ])
    })

    expect(writeAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedCharacterVersion: 4 })
    )
  })

  it("one-shot retries a stale durable write with the refetched vitals version", async () => {
    const { rendered } = renderLanes()
    writeAction
      .mockResolvedValueOnce(err("stale"))
      .mockResolvedValueOnce(
        ok({ version: 9, channel: { domain: "character", shortId: "abc123" } })
      )
    versionAction.mockResolvedValue(ok({ version: 8 }))

    let result: Awaited<
      ReturnType<
        NonNullable<
          ReturnType<typeof rendered.result.current.lanes.laneOf>
        >["commit"]
      >
    >
    await act(async () => {
      result = await rendered.result.current.lanes
        .laneOf(durableId)!
        .commit(damage)
    })

    expect(result!.ok).toBe(true)
    expect(versionAction).toHaveBeenCalledWith({
      entityId: "char-1",
      versionClass: "vitals",
    })
    expect(writeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedCharacterVersion: 8 })
    )
  })
})

describe("useCombatantLanes — channels + pings", () => {
  it("lists one deduped channel per durable character in the roster", () => {
    const { rendered } = renderLanes([inlineId, durableId, durableTwinId])
    expect(rendered.result.current.lanes.pcChannels).toEqual([
      { characterId: "char-1", shortId: "abc123" },
    ])
  })

  it("drops a durable participant from the channel list when it leaves the roster", () => {
    const { rendered } = renderLanes([inlineId])
    expect(rendered.result.current.lanes.pcChannels).toEqual([])
  })

  it("onPcPing forwards a fresher vitals version and refreshes", () => {
    const { rendered, onFresher } = renderLanes()
    act(() => {
      rendered.result.current.lanes.onPcPing("char-1", {
        kind: "entity",
        versions: { vitals: 9 },
      })
    })
    expect(onFresher).toHaveBeenCalledTimes(1)
  })

  it("onPcPing skips an echo of the console's own write (stale/equal vitals)", () => {
    const { rendered, onFresher } = renderLanes()
    act(() => {
      // The seeding effect has forwarded the map to the meta's vitalsVersion 3.
      rendered.result.current.lanes.onPcPing("char-1", {
        kind: "entity",
        versions: { vitals: 3 },
      })
    })
    expect(onFresher).not.toHaveBeenCalled()
  })

  it("onPcPing ignores v1 characters-row pings — their counters aren't the durable vitals token", () => {
    const { rendered, onFresher } = renderLanes()
    act(() => {
      rendered.result.current.lanes.onPcPing("char-1", {
        kind: "character",
        versions: { vitals: 9 },
      })
    })
    expect(onFresher).not.toHaveBeenCalled()
  })
})
