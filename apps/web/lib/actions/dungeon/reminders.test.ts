import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"
import {
  createDungeonState,
  type DungeonState,
} from "@workspace/game-v2/spatial"

import {
  setRandomEncounterIntervalAction,
  setRandomEncountersEnabledAction,
} from "./reminders"

// Stub the seams — the dungeon-row lookup, the DM gate, the guarded write, and
// `revalidateDungeon` (imports `server-only` transitively). The per-field merge
// runs for real, so this asserts the UNN-226 discipline: each action touches ONE
// field and the server reads + merges (never a client-built full object).
const loadDungeonRowById = vi.fn()
const requireCampaignDM = vi.fn()
const saveDungeonState = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  saveDungeonState: (id: string, state: DungeonState, v: number) =>
    saveDungeonState(id, state, v),
}))
vi.mock("./revalidate", () => ({
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const FORBIDDEN = new Error("forbidden")

function dungeonRow(state: DungeonState) {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    mapInstanceId: "mi-1",
    shortId: "dng-short",
    status: "active" as const,
    state,
    version: 0,
  }
}

function stateWith(
  enabled: boolean,
  intervalTurns: 1 | 2 | 3 | 6
): DungeonState {
  return {
    ...createDungeonState(),
    turnCounter: 7,
    actedCharacterIds: ["char-1"],
    reminderSettings: { randomEncounters: { enabled, intervalTurns } },
  }
}

const savedState = () => saveDungeonState.mock.calls[0]![1] as DungeonState

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID })
  saveDungeonState.mockResolvedValue(ok({ version: 1 }))
})

describe("setRandomEncountersEnabledAction", () => {
  it("merges only `enabled`, preserving the interval sibling and the rest of state", async () => {
    loadDungeonRowById.mockResolvedValue(dungeonRow(stateWith(false, 3)))

    const result = await setRandomEncountersEnabledAction({
      dungeonId: DUNGEON_ID,
      enabled: true,
      expectedVersion: 0,
    })

    expect(result).toEqual({ ok: true, value: { version: 1 } })
    expect(requireCampaignDM).toHaveBeenCalledWith(CAMPAIGN_ID)
    expect(savedState().reminderSettings.randomEncounters).toEqual({
      enabled: true,
      intervalTurns: 3,
    })
    expect(savedState().turnCounter).toBe(7)
    expect(savedState().actedCharacterIds).toEqual(["char-1"])
    expect(saveDungeonState).toHaveBeenCalledWith(
      DUNGEON_ID,
      expect.anything(),
      0
    )
    expect(revalidateDungeon).toHaveBeenCalled()
    expect(publishDungeonPing).toHaveBeenCalledOnce()
  })

  it("returns dungeon-not-found without gating or writing", async () => {
    loadDungeonRowById.mockResolvedValue(null)

    const result = await setRandomEncountersEnabledAction({
      dungeonId: DUNGEON_ID,
      enabled: true,
      expectedVersion: 0,
    })

    expect(result).toEqual({ ok: false, error: "dungeon-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(saveDungeonState).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    loadDungeonRowById.mockResolvedValue(dungeonRow(stateWith(false, 6)))
    requireCampaignDM.mockRejectedValue(FORBIDDEN)

    await expect(
      setRandomEncountersEnabledAction({
        dungeonId: DUNGEON_ID,
        enabled: true,
        expectedVersion: 0,
      })
    ).rejects.toBe(FORBIDDEN)
    expect(saveDungeonState).not.toHaveBeenCalled()
  })

  it("propagates a stale guarded-write error and does not revalidate", async () => {
    loadDungeonRowById.mockResolvedValue(dungeonRow(stateWith(false, 6)))
    saveDungeonState.mockResolvedValue(err("stale"))

    const result = await setRandomEncountersEnabledAction({
      dungeonId: DUNGEON_ID,
      enabled: true,
      expectedVersion: 0,
    })

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })
})

describe("setRandomEncounterIntervalAction", () => {
  it("merges only `intervalTurns`, preserving the enabled sibling", async () => {
    loadDungeonRowById.mockResolvedValue(dungeonRow(stateWith(true, 6)))

    const result = await setRandomEncounterIntervalAction({
      dungeonId: DUNGEON_ID,
      intervalTurns: 2,
      expectedVersion: 0,
    })

    expect(result).toEqual({ ok: true, value: { version: 1 } })
    expect(savedState().reminderSettings.randomEncounters).toEqual({
      enabled: true,
      intervalTurns: 2,
    })
    expect(revalidateDungeon).toHaveBeenCalled()
  })

  it("rejects an off-cadence interval as invalid-input without touching the DB", async () => {
    const result = await setRandomEncounterIntervalAction({
      dungeonId: DUNGEON_ID,
      intervalTurns: 4 as never,
      expectedVersion: 0,
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadDungeonRowById).not.toHaveBeenCalled()
  })
})
