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
const publishDungeonInstancePing = vi.fn()
const loadMapInstanceForWriteLocked = vi.fn()
const saveLockedMapInstanceState = vi.fn()

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
  lockDungeonRowForLifecycle: (tx: unknown, id: string) =>
    lockDungeonRowForLifecycle(tx, id),
  mapActivationRaceToActiveDelve: async (p: unknown) => p,
  setDungeonStatus: (id: string, status: string, v: number, tx: unknown) =>
    setDungeonStatus(id, status, v, tx),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  guardMany: async (body: (tx: unknown) => unknown) => body("tx"),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  loadMapInstanceForWriteLocked: (tx: unknown, id: string) =>
    loadMapInstanceForWriteLocked(tx, id),
  saveLockedMapInstanceState: (
    tx: unknown,
    row: unknown,
    state: unknown,
    options: unknown
  ) => saveLockedMapInstanceState(tx, row, state, options),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
  publishDungeonInstancePing: (shortId: string, version: number) =>
    publishDungeonInstancePing(shortId, version),
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const FORBIDDEN = new Error("forbidden")

const dungeonRow = {
  id: DUNGEON_ID,
  campaignId: CAMPAIGN_ID,
  shortId: "dng-short",
  status: "draft" as const,
  mapInstanceId: "mi-1",
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
  loadMapInstanceForWriteLocked.mockResolvedValue(
    ok({ id: "mi-1", state: {}, status: "open", version: 0 })
  )
  saveLockedMapInstanceState.mockResolvedValue(ok({ version: 1 }))
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

  it("converges when the locked row already holds the target status (desired state)", async () => {
    // The friendly pre-read passed, but under the lock the row is already
    // active (a racing start won — or this is a redelivered flip). The target
    // already holds, so the command reports ok with the current version and
    // writes, pings, and revalidates nothing.
    lockDungeonRowForLifecycle.mockResolvedValue(ok(lockedRow("active")))

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: true, value: { version: 0 } })
    expect(setDungeonStatus).not.toHaveBeenCalled()
    expect(publishDungeonPing).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
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

  it("freezes the map when going done without running the one-active guard", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(ok(lockedRow("active")))

    const result = await setDungeonStatusAction({ ...goActive, status: "done" })

    expect(result).toEqual({
      ok: true,
      value: { version: 1, instanceVersion: 1 },
    })
    expect(loadActiveDungeonForCampaign).not.toHaveBeenCalled()
    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "done", 0, "tx")
    expect(saveLockedMapInstanceState).toHaveBeenCalledWith(
      "tx",
      expect.objectContaining({ id: "mi-1" }),
      {},
      { freeze: true }
    )
  })

  it("propagates a stale guarded-write error", async () => {
    setDungeonStatus.mockResolvedValue(err("stale"))

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("propagates a vanished dungeon from the lifecycle lock without writing", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(err("dungeon-not-found"))

    const result = await setDungeonStatusAction(goActive)

    expect(result).toEqual({ ok: false, error: "dungeon-not-found" })
    expect(setDungeonStatus).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
