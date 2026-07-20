import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createDungeonState,
  type DungeonState,
} from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import type { WriteExecutor } from "@/lib/db/client"

import { applyDungeonEvent } from "./events"

// Stub the seams — the DM gate, the campaignId + row loads, the lifecycle
// lock, and the guarded dungeon write — so this is a pure unit test of the
// de-versioned turn-loop command (UNN-657); the reducer + schema run for
// real. `guardMany` passes the body a fake executor and surfaces its result
// verbatim (the rollback-on-err semantics collapse to pass-through here).
const requireCampaignDM = vi.fn()
const loadDungeonCampaignId = vi.fn()
const loadDungeonRowById = vi.fn()
const lockDungeonRowForLifecycle = vi.fn()
const saveDungeonState = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonCampaignId: (id: string) => loadDungeonCampaignId(id),
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  lockDungeonRowForLifecycle: (tx: unknown, id: string) =>
    lockDungeonRowForLifecycle(tx, id),
  saveDungeonState: (id: string, state: DungeonState, v: number) =>
    saveDungeonState(id, state, v),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  guardMany: async <T, E>(body: (tx: WriteExecutor) => Promise<Result<T, E>>) =>
    body({} as WriteExecutor),
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

function dungeonRow(state: DungeonState = createDungeonState()) {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    mapInstanceId: "mi-1",
    shortId: "dng-short",
    status: "active" as const,
    state,
    version: 3,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonCampaignId.mockResolvedValue(CAMPAIGN_ID)
  loadDungeonRowById.mockResolvedValue(dungeonRow())
  lockDungeonRowForLifecycle.mockResolvedValue(ok(dungeonRow()))
  requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID })
  saveDungeonState.mockResolvedValue(ok({ version: 4 }))
})

describe("applyDungeonEvent — auth + validation", () => {
  it("rejects a malformed payload before any DB read", async () => {
    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "bogus" } as never,
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadDungeonCampaignId).not.toHaveBeenCalled()
  })

  it("rejects advanceTurn without its semantic expectedTurn", async () => {
    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "advanceTurn" },
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadDungeonCampaignId).not.toHaveBeenCalled()
  })

  it("returns dungeon-not-found and never gates when the campaign is gone", async () => {
    loadDungeonCampaignId.mockResolvedValue(null)

    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "advanceTurn" },
      expectedTurn: 0,
    })

    expect(result).toEqual({ ok: false, error: "dungeon-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    const forbidden = new Error("forbidden")
    requireCampaignDM.mockRejectedValue(forbidden)

    await expect(
      applyDungeonEvent({
        dungeonId: DUNGEON_ID,
        event: { kind: "advanceTurn" },
        expectedTurn: 0,
      })
    ).rejects.toBe(forbidden)
    expect(saveDungeonState).not.toHaveBeenCalled()
  })

  it("refuses to write a non-active delve on the LOCKED row (frozen history is structural, D11)", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(
      ok({ ...dungeonRow(), status: "done" as const })
    )

    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "advanceTurn" },
      expectedTurn: 0,
    })

    expect(result).toEqual({ ok: false, error: "delve-not-active" })
    expect(saveDungeonState).not.toHaveBeenCalled()
  })
})

describe("applyDungeonEvent — the de-versioned turn loop", () => {
  it("saves guarded on the locked row's own version and pings", async () => {
    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "markActed", characterId: "char-1" },
    })

    expect(result).toEqual({ ok: true, value: { version: 4 } })
    const [, savedState, guardVersion] = saveDungeonState.mock.calls[0]!
    expect((savedState as DungeonState).actedCharacterIds).toEqual(["char-1"])
    expect(guardVersion).toBe(3)
    expect(revalidateDungeon).toHaveBeenCalled()
    expect(publishDungeonPing).toHaveBeenCalledExactlyOnceWith("dng-short", {
      version: 4,
      status: "active",
    })
  })

  it("a duplicate markActed is the reducer's no-op: current version, no write, no ping", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(
      ok(dungeonRow({ ...createDungeonState(), actedCharacterIds: ["char-1"] }))
    )

    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "markActed", characterId: "char-1" },
    })

    expect(result).toEqual({ ok: true, value: { version: 3 } })
    expect(saveDungeonState).not.toHaveBeenCalled()
    expect(publishDungeonPing).not.toHaveBeenCalled()
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })

  it("advanceTurn refuses turn-already-advanced when the locked counter moved past its expectedTurn", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(
      ok(dungeonRow({ ...createDungeonState(), turnCounter: 1 }))
    )

    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "advanceTurn" },
      expectedTurn: 0,
    })

    expect(result).toEqual({ ok: false, error: "turn-already-advanced" })
    expect(saveDungeonState).not.toHaveBeenCalled()
  })

  it("advanceTurn commits when the locked counter matches", async () => {
    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "advanceTurn" },
      expectedTurn: 0,
    })

    expect(result).toEqual({ ok: true, value: { version: 4 } })
    const [, savedState] = saveDungeonState.mock.calls[0]!
    expect((savedState as DungeonState).turnCounter).toBe(1)
  })

  it("propagates a guarded-write error and skips revalidation", async () => {
    saveDungeonState.mockResolvedValue(err("stale"))

    const result = await applyDungeonEvent({
      dungeonId: DUNGEON_ID,
      event: { kind: "advanceTurn" },
      expectedTurn: 0,
    })

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })
})
