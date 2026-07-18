import { beforeEach, describe, expect, it, vi } from "vitest"

import { templateSetContentSchema } from "@workspace/game-v2/generation"
import {
  createDungeonState,
  type DungeonState,
  type MapGeometry,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import { ok } from "@workspace/result"

import { startExpeditionAction } from "./expedition-start"

// Stub the DB seams; the engine (`mapInstanceFromGeometry` → `withAuthoredProvenance`
// → `applyStaticReveal` → `seedMintedUniqueKeys`/`sproutStartStubs` → `placeRoster`)
// runs for real, so this asserts the expedition-start pipeline end to end: the LIVE
// seed Map is snapshotted, every snapshot Zone is stamped authored **with its
// multi-source depth**, the Region's escrowed chart is re-applied (stale ids
// filtered), bound authored Zones sprout stubs off the expedition seed, authored
// uniques seed the ledger, and the roster's placement reveals union in — all
// flipped `draft → active` **with the initial ledger** behind the D11 lifecycle
// lock. `mapActivationRaceToActiveDelve` is a passthrough (its index-loss mapping
// is unit-tested in dungeon.ts).
const requireCampaignDM = vi.fn()
const loadDungeonVariantForWrite = vi.fn()
const loadActiveDungeonForCampaign = vi.fn()
const loadRegionRowById = vi.fn()
const loadMapRowById = vi.fn()
const loadTemplateSetRowById = vi.fn()
const loadLiveEncounterForMapInstance = vi.fn()
const lockDungeonRowForLifecycle = vi.fn()
const activateDungeonWithState = vi.fn()
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
vi.mock("@/lib/db/queries/load-template-set", () => ({
  loadTemplateSetRowById: (id: string) => loadTemplateSetRowById(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadLiveEncounterForMapInstance: (id: string, tx: unknown) =>
    loadLiveEncounterForMapInstance(id, tx),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  lockDungeonRowForLifecycle: (tx: unknown, id: string, v: number) =>
    lockDungeonRowForLifecycle(tx, id, v),
  activateDungeonWithState: (
    tx: unknown,
    id: string,
    state: DungeonState,
    v: number
  ) => activateDungeonWithState(tx, id, state, v),
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

// z1 (the entrance) is bound to the unique 3-exit castle-entrance; z2 to the
// 2-exit hall (one exit optional); z3 is unbound. z1—z2 are connected (that
// authored connection consumes exit budget on both) and z3 hangs off z2.
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
      templateKey: "castle-entrance",
    },
    z2: {
      id: "z2",
      name: "Charted Vault",
      description: "",
      dmNotes: "",
      position: { x: 600, y: 0 },
      pageId: "default",
      templateKey: "hall",
    },
    z3: {
      id: "z3",
      name: "Far Cell",
      description: "",
      dmNotes: "",
      position: { x: 1200, y: 0 },
      pageId: "default",
    },
  },
  connections: {
    c12: {
      id: "c12",
      fromZoneId: "z1",
      toZoneId: "z2",
      hidden: false,
      locked: false,
    },
    c23: {
      id: "c23",
      fromZoneId: "z2",
      toZoneId: "z3",
      hidden: false,
      locked: false,
    },
  },
}

const TEMPLATE_SET_CONTENT = templateSetContentSchema.parse({
  templates: {
    "castle-entrance": {
      key: "castle-entrance",
      unique: true,
      exits: [{ optional: false }, { optional: false }, { optional: false }],
    },
    hall: {
      key: "hall",
      exits: [{ optional: false }, { optional: true }],
    },
  },
})

function draftExpedition() {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    mapInstanceId: MAP_INSTANCE_ID,
    shortId: "exp-short",
    status: "draft" as const,
    version: 0,
    state: createDungeonState(),
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

/** Deterministic uuid spy: `uuid-0`, `uuid-1`, … per test. */
function spyDeterministicUuids() {
  let n = 0
  return vi
    .spyOn(crypto, "randomUUID")
    .mockImplementation(
      () => `uuid-${n++}` as unknown as ReturnType<typeof crypto.randomUUID>
    )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  loadDungeonVariantForWrite.mockResolvedValue({
    kind: "expedition",
    row: draftExpedition(),
    regionId: REGION_ID,
  })
  requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID })
  loadActiveDungeonForCampaign.mockResolvedValue(null)
  loadRegionRowById.mockResolvedValue(makeRegion())
  loadMapRowById.mockResolvedValue({ id: SEED_MAP_ID, geometry: GEOMETRY })
  loadTemplateSetRowById.mockResolvedValue({
    id: "set-1",
    content: TEMPLATE_SET_CONTENT,
  })
  loadLiveEncounterForMapInstance.mockResolvedValue(null)
  lockDungeonRowForLifecycle.mockResolvedValue(ok(draftExpedition()))
  activateDungeonWithState.mockResolvedValue(ok({ version: 1 }))
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

  it("returns template-set-not-found when the Region's Set is gone (UNN-590)", async () => {
    loadTemplateSetRowById.mockResolvedValue(null)

    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({ ok: false, error: "template-set-not-found" })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("snapshots the live seed, stamps authored depths, re-applies the chart, sprouts stubs, unions placement reveals, and flips active with the ledger", async () => {
    const result = await startExpeditionAction(startInput)

    expect(result).toEqual({
      ok: true,
      value: { version: 1, instanceVersion: 5 },
    })

    const next = saveMapInstanceState.mock.calls[0]![2] as MapInstanceState

    // Geometry snapshotted from the LIVE seed Map.
    expect(Object.keys(next.geometry.zones).sort()).toEqual(["z1", "z2", "z3"])

    // Every snapshot Zone stamped authored with its BFS depth from the starting
    // Zone (the provenance the fold later gates on; depths gate P4's draws).
    expect(next.generation.zones.z1).toEqual({ source: "authored", depth: 0 })
    expect(next.generation.zones.z2).toEqual({ source: "authored", depth: 1 })
    expect(next.generation.zones.z3).toEqual({ source: "authored", depth: 2 })

    // Stub sprouting (D5 step 6): the entrance's 3 required exits minus its one
    // authored connection → 2 stubs on z1; hall's ≤2 exits minus its two
    // authored connections → none; unbound z3 → none.
    const stubs = Object.values(next.generation.stubs)
    expect(stubs.filter((stub) => stub.zoneId === "z1")).toHaveLength(2)
    expect(stubs.filter((stub) => stub.zoneId !== "z1")).toHaveLength(0)
    for (const stub of stubs) {
      expect(stub.anchor.offset).toBeGreaterThanOrEqual(0.05)
      expect(stub.anchor.offset).toBeLessThanOrEqual(0.95)
    }

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

    // The activation writes the initial ledger in the same guarded bump: the
    // minted seed, the authored unique seeded (the ledger law's delve-start
    // case), and the cull draws' cursor (hall's one optional exit = one
    // templates draw, consumed kept-or-culled).
    const dungeonState = activateDungeonWithState.mock
      .calls[0]![2] as DungeonState
    expect(activateDungeonWithState).toHaveBeenCalledWith(
      "tx",
      DUNGEON_ID,
      expect.anything(),
      0
    )
    expect(dungeonState.generation.seed).not.toBe("")
    expect(dungeonState.generation.mintedUniqueKeys).toEqual([
      "castle-entrance",
    ])
    expect(dungeonState.generation.streamCursors).toEqual({ templates: 1 })
    expect(dungeonState.generation.declarations).toEqual([])
    expect(dungeonState.generation.mints).toEqual({})

    expect(publishDungeonPing).toHaveBeenCalledExactlyOnceWith("exp-short", {
      version: 1,
      status: "active",
    })
    expect(revalidateDungeon).toHaveBeenCalled()
  })

  it("a split start is legal: each placement zone is depth 0", async () => {
    const result = await startExpeditionAction({
      ...startInput,
      placements: [
        { characterId: "char-1", zoneId: "z1" },
        { characterId: "char-2", zoneId: "z3" },
      ],
    })
    expect(result.ok).toBe(true)

    const next = saveMapInstanceState.mock.calls[0]![2] as MapInstanceState
    expect(next.generation.zones.z1).toEqual({ source: "authored", depth: 0 })
    expect(next.generation.zones.z3).toEqual({ source: "authored", depth: 0 })
    // z2 sits one step from either starting zone.
    expect(next.generation.zones.z2).toEqual({ source: "authored", depth: 1 })
  })

  it("is deterministic under a pinned seed: two runs sprout identical stubs", async () => {
    spyDeterministicUuids()
    await startExpeditionAction(startInput)
    const first = saveMapInstanceState.mock.calls[0]![2] as MapInstanceState

    vi.clearAllMocks()
    spyDeterministicUuids()
    loadDungeonVariantForWrite.mockResolvedValue({
      kind: "expedition",
      row: draftExpedition(),
      regionId: REGION_ID,
    })
    requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID })
    loadActiveDungeonForCampaign.mockResolvedValue(null)
    loadRegionRowById.mockResolvedValue(makeRegion())
    loadMapRowById.mockResolvedValue({ id: SEED_MAP_ID, geometry: GEOMETRY })
    loadTemplateSetRowById.mockResolvedValue({
      id: "set-1",
      content: TEMPLATE_SET_CONTENT,
    })
    loadLiveEncounterForMapInstance.mockResolvedValue(null)
    lockDungeonRowForLifecycle.mockResolvedValue(ok(draftExpedition()))
    activateDungeonWithState.mockResolvedValue(ok({ version: 1 }))
    saveMapInstanceState.mockResolvedValue(ok({ version: 5 }))
    await startExpeditionAction(startInput)
    const second = saveMapInstanceState.mock.calls[0]![2] as MapInstanceState

    expect(second.generation.stubs).toStrictEqual(first.generation.stubs)
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
    expect(activateDungeonWithState).not.toHaveBeenCalled()
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })
})
