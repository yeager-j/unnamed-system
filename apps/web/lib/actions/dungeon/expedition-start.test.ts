import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MapGeometry, MapInstanceState } from "@workspace/game-v2/spatial"
import { err, ok } from "@workspace/result"

import { startExpeditionAction } from "./expedition-start"

// Stub the DB seams; the engine (`mapInstanceFromGeometry` → `withAuthoredProvenance`
// → `applyStaticReveal` → `placeRoster`) runs for real, so this asserts the
// expedition-start pipeline end to end: the LIVE seed Map is snapshotted, every
// snapshot Zone is stamped authored, the Region's escrowed chart is re-applied
// (stale ids filtered), and the roster's placement reveals union in — all flipped
// `draft → active` behind the D11 lifecycle lock. `mapActivationRaceToActiveDelve`
// is a passthrough (its index-loss mapping is unit-tested in dungeon.ts).
const requireCampaignDM = vi.fn()
const loadDungeonVariantForWrite = vi.fn()
const loadActiveDungeonForCampaign = vi.fn()
const loadRegionRowById = vi.fn()
const loadMapRowById = vi.fn()
const loadLiveEncounterForMapInstance = vi.fn()
const lockDungeonRowForLifecycle = vi.fn()
const setDungeonStatus = vi.fn()
const saveMapInstanceState = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonVariantForWrite: (id: string) => loadDungeonVariantForWrite(id),
  loadActiveDungeonForCampaign: (id: string) =>
    loadActiveDungeonForCampaign(id),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  loadRegionRowById: (id: string) => loadRegionRowById(id),
}))
vi.mock("@/lib/db/queries/load-map", () => ({
  loadMapRowById: (id: string) => loadMapRowById(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadLiveEncounterForMapInstance: (id: string, tx: unknown) =>
    loadLiveEncounterForMapInstance(id, tx),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  lockDungeonRowForLifecycle: (tx: unknown, id: string, v: number) =>
    lockDungeonRowForLifecycle(tx, id, v),
  setDungeonStatus: (id: string, status: string, v: number, tx: unknown) =>
    setDungeonStatus(id, status, v, tx),
  mapActivationRaceToActiveDelve: async (p: unknown) => p,
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  saveMapInstanceState: (
    tx: unknown,
    id: string,
    state: MapInstanceState,
    v: number
  ) => saveMapInstanceState(tx, id, state, v),
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
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"
const REGION_ID = "region-1"
const SEED_MAP_ID = "seed-map-1"

const GEOMETRY: MapGeometry = {
  pages: { default: { id: "default", name: "Page 1" } },
  zones: {
    z1: {
      id: "z1",
      name: "Entry Hall",
      description: "",
      dmNotes: "",
      position: { x: 0, y: 0 },
      pageId: "default",
    },
    z2: {
      id: "z2",
      name: "Charted Vault",
      description: "",
      dmNotes: "",
      position: { x: 1, y: 0 },
      pageId: "default",
    },
  },
  connections: {},
}

function draftExpedition() {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    mapInstanceId: MAP_INSTANCE_ID,
    shortId: "exp-short",
    status: "draft" as const,
    version: 0,
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
    // z2 was charted last expedition; `ghost-zone` was charted then deleted from
    // the seed Map — it must filter out silently on re-apply.
    staticReveal: {
      [SEED_MAP_ID]: { zoneIds: ["z2", "ghost-zone"], connectionIds: [] },
    },
    archivedAt: null,
    version: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

const startInput = {
  dungeonId: DUNGEON_ID,
  expectedVersion: 0,
  expectedInstanceVersion: 0,
  placements: [{ characterId: "char-1", zoneId: "z1" }],
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonVariantForWrite.mockResolvedValue({
    kind: "expedition",
    row: draftExpedition(),
    regionId: REGION_ID,
  })
  requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID })
  loadActiveDungeonForCampaign.mockResolvedValue(null)
  loadRegionRowById.mockResolvedValue(makeRegion())
  loadMapRowById.mockResolvedValue({ id: SEED_MAP_ID, geometry: GEOMETRY })
  loadLiveEncounterForMapInstance.mockResolvedValue(null)
  lockDungeonRowForLifecycle.mockResolvedValue(ok(draftExpedition()))
  setDungeonStatus.mockResolvedValue(ok({ version: 1 }))
  saveMapInstanceState.mockResolvedValue(ok({ version: 5 }))
})

describe("startExpeditionAction", () => {
  it("refuses an ordinary delve — this lifecycle belongs to startDelveAction", async () => {
    loadDungeonVariantForWrite.mockResolvedValue({
      kind: "delve",
      row: draftExpedition(),
    })

    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({ ok: false, error: "not-an-expedition" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("rejects starting an expedition that is not in draft", async () => {
    loadDungeonVariantForWrite.mockResolvedValue({
      kind: "expedition",
      row: { ...draftExpedition(), status: "active" },
      regionId: REGION_ID,
    })

    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({ ok: false, error: "delve-not-draft" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("rejects when another delve already holds the campaign's active slot", async () => {
    loadActiveDungeonForCampaign.mockResolvedValue({ id: "other-delve" })

    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({
      ok: false,
      error: "campaign-already-has-active-delve",
    })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("returns region-not-found when the designation is gone", async () => {
    loadRegionRowById.mockResolvedValue(null)

    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({ ok: false, error: "region-not-found" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("returns map-not-found when the live seed Map is gone", async () => {
    loadMapRowById.mockResolvedValue(null)

    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({ ok: false, error: "map-not-found" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("snapshots the live seed, stamps authored provenance, re-applies the chart (stale filtered), unions placement reveals, and flips active", async () => {
    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({
      ok: true,
      value: { version: 1, instanceVersion: 5 },
    })

    const next = saveMapInstanceState.mock.calls[0]![2] as MapInstanceState

    // Geometry snapshotted from the LIVE seed Map.
    expect(Object.keys(next.geometry.zones).sort()).toEqual(["z1", "z2"])

    // Every snapshot Zone stamped authored (the provenance the fold later gates on).
    expect(next.generation.zones.z1).toEqual({ source: "authored" })
    expect(next.generation.zones.z2).toEqual({ source: "authored" })

    // The charted z2 re-applied and the placement's z1 unioned in; the deleted
    // `ghost-zone` filtered out silently (absent from the fresh geometry).
    expect(next.reveal.revealedZoneIds).toContain("z1")
    expect(next.reveal.revealedZoneIds).toContain("z2")
    expect(next.reveal.revealedZoneIds).not.toContain("ghost-zone")
    expect(next.reveal.revealedZoneIds).toHaveLength(2)

    // The party token placed onto its starting Zone.
    expect(next.occupancy["char-1"]).toEqual({
      zoneId: "z1",
      engagement: { status: "free" },
    })

    expect(setDungeonStatus).toHaveBeenCalledWith(DUNGEON_ID, "active", 0, "tx")
    expect(publishDungeonPing).toHaveBeenCalledExactlyOnceWith("exp-short", {
      version: 1,
      status: "active",
    })
    expect(revalidateDungeon).toHaveBeenCalled()
  })

  it("refuses when the locked row is no longer draft (a racing start won)", async () => {
    lockDungeonRowForLifecycle.mockResolvedValue(
      ok({ ...draftExpedition(), status: "active" })
    )

    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({ ok: false, error: "delve-not-draft" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })

  it("refuses under a live encounter on this Instance (in-tx read) — a fight can't straddle the snapshot", async () => {
    loadLiveEncounterForMapInstance.mockResolvedValue({
      id: "enc-1",
      shortId: "enc-short",
      status: "live",
    })

    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({ ok: false, error: "delve-has-live-encounter" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
    expect(setDungeonStatus).not.toHaveBeenCalled()
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })
})
