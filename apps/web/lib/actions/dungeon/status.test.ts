import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import { setDungeonStatusAction } from "./status"

// Stub every seam — the dungeon-row lookup, the DM gate, the active-delve read, the
// guarded status write, and `revalidatePath` (imports `server-only` transitively) —
// so this is a pure unit test of the one-active-delve orchestration.
// `requireCampaignDM` returns a campaign row (with `shortId`) on success and is
// stubbed to throw a sentinel on the non-DM path.
const loadDungeonRowById = vi.fn()
const requireCampaignDM = vi.fn()
const loadActiveDungeonForCampaign = vi.fn()
const setDungeonStatus = vi.fn()
const revalidatePath = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
  loadActiveDungeonForCampaign: (id: string) =>
    loadActiveDungeonForCampaign(id),
}))
vi.mock("./revalidate", () => ({
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  setDungeonStatus: (id: string, status: string, v: number) =>
    setDungeonStatus(id, status, v),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const FORBIDDEN = new Error("forbidden")

const goActive = {
  dungeonId: DUNGEON_ID,
  status: "active" as const,
  expectedVersion: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonRowById.mockResolvedValue({
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "dng-short",
  })
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    shortId: "camp-short",
  })
  loadActiveDungeonForCampaign.mockResolvedValue(null)
  setDungeonStatus.mockResolvedValue(ok({ version: 1 }))
})

describe("setDungeonStatusAction", () => {
  it("rejects an invalid status without touching the DB", async () => {
    const result = await setDungeonStatusAction({
      ...goActive,
      status: "draft" as never,
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadDungeonRowById).not.toHaveBeenCalled()
  })

  it("returns dungeon-not-found when the row is gone", async () => {
    loadDungeonRowById.mockResolvedValue(null)

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "dungeon-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    requireCampaignDM.mockRejectedValue(FORBIDDEN)

    await expect(setDungeonStatusAction(goActive)).rejects.toBe(FORBIDDEN)
    expect(setDungeonStatus).not.toHaveBeenCalled()
  })

  it("rejects going active when another delve already holds the slot", async () => {
    loadActiveDungeonForCampaign.mockResolvedValue({ id: "other-dungeon" })

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({
      ok: false,
      error: "campaign-already-has-active-delve",
    })
    expect(setDungeonStatus).not.toHaveBeenCalled()
  })

  it("allows going active when this delve is already the active one (idempotent)", async () => {
    loadActiveDungeonForCampaign.mockResolvedValue({ id: DUNGEON_ID })

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: true, value: { version: 1 } })
    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "active", 0)
  })

  it("flips the status and revalidates the campaign overview + console on success", async () => {
    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: true, value: { version: 1 } })
    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "active", 0)
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/camp-short")
    expect(revalidateDungeon).toHaveBeenCalledWith({
      id: DUNGEON_ID,
      campaignId: CAMPAIGN_ID,
      shortId: "dng-short",
    })
    // The lifecycle flip pings the dungeon channel with the new status (UNN-468).
    expect(publishDungeonPing).toHaveBeenCalledExactlyOnceWith("dng-short", {
      version: 1,
      status: "active",
    })
  })

  it("does not run the one-active guard when going done", async () => {
    const result = await setDungeonStatusAction({ ...goActive, status: "done" })

    expect(result).toEqual({ ok: true, value: { version: 1 } })
    expect(loadActiveDungeonForCampaign).not.toHaveBeenCalled()
    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "done", 0)
  })

  it("propagates a stale guarded-write error", async () => {
    setDungeonStatus.mockResolvedValue(err("stale"))

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
