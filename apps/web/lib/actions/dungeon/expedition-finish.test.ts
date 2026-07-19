import { beforeEach, describe, expect, it, vi } from "vitest"

import type { StaticReveal } from "@workspace/game-v2/generation"
import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { err, ok } from "@workspace/result"

import { finishExpeditionAction } from "./expedition-finish"

// Stub the DB seams; `foldExpedition` (game-v2 generation) runs for real, so the
// fold assertions exercise the actual authored-vs-manual provenance filter. The
// D11 finish is a `guardMany` over dungeon → instance → region in lock order: lock
// → freeze → read-frozen-through-tx → refuse-under-live → fold → status done.
// `guardMany` runs its body inline with a sentinel executor.
const requireCampaignDM = vi.fn()
const loadDungeonVariantForWrite = vi.fn()
const loadLiveEncounterForMapInstance = vi.fn()
const loadMapInstanceById = vi.fn()
const loadRegionRowById = vi.fn()
const lockDungeonRowForLifecycle = vi.fn()
const freezeMapInstance = vi.fn()
const foldRegionStaticReveal = vi.fn()
const setDungeonStatus = vi.fn()
const revalidatePath = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()
const publishDungeonInstancePing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonVariantForWrite: (id: string) => loadDungeonVariantForWrite(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadLiveEncounterForMapInstance: (id: string, tx: unknown) =>
    loadLiveEncounterForMapInstance(id, tx),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string, tx: unknown) => loadMapInstanceById(id, tx),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  loadRegionRowById: (id: string, tx: unknown) => loadRegionRowById(id, tx),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  lockDungeonRowForLifecycle: (tx: unknown, id: string, v: number) =>
    lockDungeonRowForLifecycle(tx, id, v),
  setDungeonStatus: (id: string, status: string, v: number, tx: unknown) =>
    setDungeonStatus(id, status, v, tx),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  loadMapInstanceForWriteLocked: async (tx: unknown, id: string) => {
    const row = await loadMapInstanceById(id, tx)
    return row === null
      ? err("map-instance-not-found")
      : ok({ ...row, status: "open" })
  },
  saveLockedMapInstanceState: (
    tx: unknown,
    row: { id: string; version: number }
  ) => freezeMapInstance(tx, row.id, row.version),
  freezeMapInstance: (tx: unknown, id: string, v: number) =>
    freezeMapInstance(tx, id, v),
}))
vi.mock("@/lib/db/writes/region", () => ({
  foldRegionStaticReveal: (
    tx: unknown,
    id: string,
    v: number,
    reveal: StaticReveal
  ) => foldRegionStaticReveal(tx, id, v, reveal),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  guardMany: async (body: (tx: unknown) => unknown) => body("tx"),
}))
vi.mock("./revalidate", () => ({
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
  publishDungeonInstancePing: (shortId: string, version: number) =>
    publishDungeonInstancePing(shortId, version),
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"
const REGION_ID = "region-1"
const SEED_MAP_ID = "seed-map-1"

function activeExpedition() {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    mapInstanceId: MAP_INSTANCE_ID,
    shortId: "exp-short",
    status: "active" as const,
    version: 0,
  }
}

/** An Instance whose reveal covers an authored Zone (z1) and a manual one (z2):
 *  only the authored id folds back to the Region's chart. */
function instanceState(): MapInstanceState {
  const zone = (id: string) => ({
    id,
    name: id,
    description: "",
    dmNotes: "",
    position: { x: 0, y: 0 },
    pageId: "default",
  })
  return {
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: { z1: zone("z1"), z2: zone("z2") },
      connections: {},
    },
    occupancy: {},
    enchantment: null,
    reveal: {
      revealedZoneIds: ["z1", "z2"],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    generation: {
      zones: {
        z1: { source: "authored", depth: 0 },
        z2: { source: "manual", depth: 0 },
      },
      stubs: {},
      connections: {},
      grafts: {},
    },
    lastMovedTokenKey: null,
  }
}

function makeRegion() {
  return {
    id: REGION_ID,
    shortId: "rgn-short",
    campaignId: CAMPAIGN_ID,
    name: "Region",
    seedMapId: SEED_MAP_ID,
    templateSetId: "set-1",
    settings: {},
    discoveredSiteKeys: [],
    staticReveal: {} as StaticReveal,
    archivedAt: null,
    version: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

const INPUT = {
  dungeonId: DUNGEON_ID,
  expectedVersion: 0,
  expectedInstanceVersion: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonVariantForWrite.mockResolvedValue({
    kind: "expedition",
    row: activeExpedition(),
    regionId: REGION_ID,
  })
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    shortId: "camp-short",
  })
  loadLiveEncounterForMapInstance.mockResolvedValue(null)
  lockDungeonRowForLifecycle.mockResolvedValue(ok(activeExpedition()))
  freezeMapInstance.mockResolvedValue(ok({ version: 9 }))
  loadMapInstanceById.mockResolvedValue({
    id: MAP_INSTANCE_ID,
    state: instanceState(),
    version: 0,
  })
  loadRegionRowById.mockResolvedValue(makeRegion())
  foldRegionStaticReveal.mockResolvedValue(ok({ version: 4 }))
  setDungeonStatus.mockResolvedValue(ok({ version: 1 }))
})

describe("finishExpeditionAction", () => {
  it("refuses an ordinary delve — a delve has no fold to commit", async () => {
    loadDungeonVariantForWrite.mockResolvedValue({
      kind: "delve",
      row: activeExpedition(),
    })

    const result = await finishExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "not-an-expedition" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(freezeMapInstance).not.toHaveBeenCalled()
  })

  it("rejects a non-active expedition at the friendly pre-check", async () => {
    loadDungeonVariantForWrite.mockResolvedValue({
      kind: "expedition",
      row: { ...activeExpedition(), status: "draft" },
      regionId: REGION_ID,
    })

    const result = await finishExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "delve-not-active" })
    expect(freezeMapInstance).not.toHaveBeenCalled()
  })

  it("rejects when the locked row is no longer active (in-tx re-check)", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(
      ok({ ...activeExpedition(), status: "done" })
    )

    const result = await finishExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "delve-not-active" })
    expect(freezeMapInstance).not.toHaveBeenCalled()
    expect(foldRegionStaticReveal).not.toHaveBeenCalled()
  })

  it("refuses under a live encounter at the friendly pre-check", async () => {
    loadLiveEncounterForMapInstance.mockResolvedValue({
      id: "enc-1",
      shortId: "enc-short",
      status: "live",
    })

    const result = await finishExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "delve-has-live-encounter" })
    expect(freezeMapInstance).not.toHaveBeenCalled()
  })

  it("refuses under a live encounter that appears in-tx (after the freeze)", async () => {
    // Boundary read clean; the in-tx read (fully serialized with combat start)
    // finds one.
    loadLiveEncounterForMapInstance
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "enc-1",
        shortId: "enc-short",
        status: "live",
      })

    const result = await finishExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "delve-has-live-encounter" })
    expect(foldRegionStaticReveal).not.toHaveBeenCalled()
    expect(setDungeonStatus).not.toHaveBeenCalled()
  })

  it("propagates a stale freeze without committing the fold (an in-flight write raced us)", async () => {
    freezeMapInstance.mockResolvedValue(err("stale"))

    const result = await finishExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(foldRegionStaticReveal).not.toHaveBeenCalled()
    expect(setDungeonStatus).not.toHaveBeenCalled()
    expect(publishDungeonPing).not.toHaveBeenCalled()
  })

  it("returns region-not-found when the designation vanished inside the tx", async () => {
    loadRegionRowById.mockResolvedValue(null)

    const result = await finishExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "region-not-found" })
    expect(foldRegionStaticReveal).not.toHaveBeenCalled()
  })

  it("freezes, folds only authored reveal into the Region (guarded on its in-tx version), flips done, and pings both rows", async () => {
    const result = await finishExpeditionAction(INPUT)

    expect(result).toEqual({
      ok: true,
      value: { version: 1, instanceVersion: 9 },
    })

    // The freeze rides the client's Instance token; the frozen state is read
    // back through the same tx.
    expect(freezeMapInstance).toHaveBeenCalledWith("tx", MAP_INSTANCE_ID, 0)
    expect(loadMapInstanceById).toHaveBeenCalledWith(MAP_INSTANCE_ID, "tx")

    // The fold commits, guarded on the region version the tx read (3), and carries
    // ONLY the authored Zone (z1) — the manual z2, though revealed, never charts.
    const [foldTx, foldRegionId, foldVersion, folded] =
      foldRegionStaticReveal.mock.calls[0]!
    expect(foldTx).toBe("tx")
    expect(foldRegionId).toBe(REGION_ID)
    expect(foldVersion).toBe(3)
    expect((folded as StaticReveal)[SEED_MAP_ID]).toEqual({
      zoneIds: ["z1"],
      connectionIds: [],
    })

    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "done", 0, "tx")

    // Both rows ping — the dungeon flipped done and the instance version moved.
    expect(publishDungeonPing).toHaveBeenCalledWith("exp-short", {
      version: 1,
      status: "done",
    })
    expect(publishDungeonInstancePing).toHaveBeenCalledWith("exp-short", 9)
    expect(revalidateDungeon).toHaveBeenCalled()
  })
})
