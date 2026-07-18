import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import { setDungeonStatusAction } from "./status"

// Stub every seam — the variant lookup, the DM gate, the active-delve read, the
// lifecycle lock, the activation-race mapper, the guarded status write, and
// `revalidatePath` (imports `server-only` transitively) — so this is a pure unit
// test of the D11 lifecycle-flip orchestration. `guardMany` runs its body inline
// with a sentinel executor (the real rollback is in guard-many.test.ts) and
// `mapActivationRaceToActiveDelve` is a passthrough (the index-loss mapping is in
// dungeon.ts). `requireCampaignDM` returns a campaign row (with `shortId`) on
// success and is stubbed to throw a sentinel on the non-DM path.
const loadDungeonVariantForWrite = vi.fn()
const requireCampaignDM = vi.fn()
const loadActiveDungeonForCampaign = vi.fn()
const lockDungeonRowForLifecycle = vi.fn()
const setDungeonStatus = vi.fn()
const revalidatePath = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonVariantForWrite: (id: string) => loadDungeonVariantForWrite(id),
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
  lockDungeonRowForLifecycle: (tx: unknown, id: string, v: number) =>
    lockDungeonRowForLifecycle(tx, id, v),
  mapActivationRaceToActiveDelve: async (p: unknown) => p,
  setDungeonStatus: (id: string, status: string, v: number, tx: unknown) =>
    setDungeonStatus(id, status, v, tx),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  guardMany: async (body: (tx: unknown) => unknown) => body("tx"),
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

const dungeonRow = {
  id: DUNGEON_ID,
  campaignId: CAMPAIGN_ID,
  shortId: "dng-short",
  status: "draft" as const,
}

/** A locked row carrying the given status — only `.status` is read on it. */
const lockedRow = (status: "draft" | "active" | "done") => ({
  ...dungeonRow,
  status,
  version: 0,
})

const goActive = {
  dungeonId: DUNGEON_ID,
  status: "active" as const,
  expectedVersion: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonVariantForWrite.mockResolvedValue({
    kind: "delve",
    row: dungeonRow,
  })
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    shortId: "camp-short",
  })
  loadActiveDungeonForCampaign.mockResolvedValue(null)
  // The locked row defaults to `draft`, so `draft → active` is a legal flip.
  lockDungeonRowForLifecycle.mockResolvedValue(ok(lockedRow("draft")))
  setDungeonStatus.mockResolvedValue(ok({ version: 1 }))
})

describe("setDungeonStatusAction", () => {
  it("rejects an invalid status without touching the DB", async () => {
    const result = await setDungeonStatusAction({
      ...goActive,
      status: "draft" as never,
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadDungeonVariantForWrite).not.toHaveBeenCalled()
  })

  it("returns dungeon-not-found when the row is gone", async () => {
    loadDungeonVariantForWrite.mockResolvedValue(null)

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "dungeon-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("refuses an expedition — that lifecycle belongs to the expedition actions", async () => {
    loadDungeonVariantForWrite.mockResolvedValue({
      kind: "expedition",
      row: dungeonRow,
      regionId: "region-1",
    })

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "delve-is-expedition" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(setDungeonStatus).not.toHaveBeenCalled()
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
    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "active", 0, "tx")
  })

  it("refuses going active when the locked row is no longer draft", async () => {
    // The friendly pre-read passed, but under the lock the row is already active
    // (a racing start won) — the legal-transition check on the locked row refuses.
    lockDungeonRowForLifecycle.mockResolvedValue(ok(lockedRow("active")))

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "delve-not-draft" })
    expect(setDungeonStatus).not.toHaveBeenCalled()
  })

  it("refuses going done when the locked row is not active (still draft)", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(ok(lockedRow("draft")))

    const result = await setDungeonStatusAction({ ...goActive, status: "done" })

    expect(result).toEqual({ ok: false, error: "delve-not-active" })
    expect(setDungeonStatus).not.toHaveBeenCalled()
  })

  it("flips the status and revalidates the campaign overview + console on success", async () => {
    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: true, value: { version: 1 } })
    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "active", 0, "tx")
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/camp-short")
    expect(revalidateDungeon).toHaveBeenCalledWith(dungeonRow)
    // The lifecycle flip pings the dungeon channel with the new status (UNN-468).
    expect(publishDungeonPing).toHaveBeenCalledExactlyOnceWith("dng-short", {
      version: 1,
      status: "active",
    })
  })

  it("does not run the one-active guard when going done", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(ok(lockedRow("active")))

    const result = await setDungeonStatusAction({ ...goActive, status: "done" })

    expect(result).toEqual({ ok: true, value: { version: 1 } })
    expect(loadActiveDungeonForCampaign).not.toHaveBeenCalled()
    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "done", 0, "tx")
  })

  it("propagates a stale guarded-write error", async () => {
    setDungeonStatus.mockResolvedValue(err("stale"))

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("propagates a stale lock (lost the version race) without writing", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(err("stale"))

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(setDungeonStatus).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
