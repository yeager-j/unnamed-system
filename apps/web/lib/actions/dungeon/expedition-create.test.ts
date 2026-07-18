import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DungeonState } from "@workspace/game-v2/spatial"

import { createExpeditionAction } from "./expedition-create"

// Stub the seams — the DM gate, the region load, and the two writes — while the
// engine (`createDungeonState` / `emptyMapInstance` / the wandering-defaults fold)
// runs for real. `db.transaction` runs its body inline with a sentinel executor so
// this asserts the two-row mint composes in one transaction and stamps the
// expedition markers (`regionId` + the Region's wandering defaults).
const requireCampaignDM = vi.fn()
const loadRegionRowById = vi.fn()
const createDungeon = vi.fn()
const insertMapInstance = vi.fn()
const revalidatePath = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}))
vi.mock("@/lib/db/client", () => ({
  db: { transaction: async (fn: (tx: unknown) => unknown) => fn("tx") },
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  loadRegionRowById: (id: string) => loadRegionRowById(id),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  createDungeon: (input: unknown, tx: unknown) => createDungeon(input, tx),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  insertMapInstance: (tx: unknown, id: string, state: unknown, mapId: string) =>
    insertMapInstance(tx, id, state, mapId),
}))

const REGION_ID = "region-1"
const CAMPAIGN_ID = "campaign-1"
const SEED_MAP_ID = "seed-map-1"

function makeRegion(
  overrides: {
    settings?: {
      wanderingTableKey?: string
      wanderingIntervalTurns?: 1 | 2 | 3 | 6
    }
    archivedAt?: Date | null
  } = {}
) {
  return {
    id: REGION_ID,
    shortId: "rgn-short",
    campaignId: CAMPAIGN_ID,
    name: "The Reshuffling Deep",
    seedMapId: SEED_MAP_ID,
    templateSetId: "set-1",
    settings: overrides.settings ?? {},
    discoveredSiteKeys: [],
    staticReveal: {},
    archivedAt: overrides.archivedAt ?? null,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

const INPUT = { regionId: REGION_ID, name: "First Expedition" }

beforeEach(() => {
  vi.clearAllMocks()
  loadRegionRowById.mockResolvedValue(makeRegion())
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    shortId: "camp-short",
  })
  createDungeon.mockResolvedValue({ id: "dng-1", shortId: "exp-short" })
  insertMapInstance.mockResolvedValue(undefined)
})

describe("createExpeditionAction", () => {
  it("rejects an empty name without touching the DB", async () => {
    const result = await createExpeditionAction({ ...INPUT, name: "  " })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadRegionRowById).not.toHaveBeenCalled()
  })

  it("returns region-not-found when the Region is gone", async () => {
    loadRegionRowById.mockResolvedValue(null)

    const result = await createExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "region-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("refuses an archived Region (minting would resurrect it)", async () => {
    loadRegionRowById.mockResolvedValue(makeRegion({ archivedAt: new Date() }))

    const result = await createExpeditionAction(INPUT)

    expect(result).toEqual({ ok: false, error: "region-archived" })
    expect(createDungeon).not.toHaveBeenCalled()
    expect(insertMapInstance).not.toHaveBeenCalled()
  })

  it("mints the blank Instance + expedition dungeon in one transaction and returns the shortId", async () => {
    const result = await createExpeditionAction(INPUT)

    expect(result).toEqual({ ok: true, value: { shortId: "exp-short" } })

    // The Instance records the Region's seed Map (start snapshots the LIVE seed).
    const [instTx, mapInstanceId, , recordedMapId] =
      insertMapInstance.mock.calls[0]!
    expect(instTx).toBe("tx")
    expect(recordedMapId).toBe(SEED_MAP_ID)

    // The dungeon carries the immutable `regionId` variant marker, on the same tx.
    const [dungeonInput, dungeonTx] = createDungeon.mock.calls[0]!
    expect(dungeonTx).toBe("tx")
    expect(dungeonInput).toMatchObject({
      campaignId: CAMPAIGN_ID,
      name: "First Expedition",
      regionId: REGION_ID,
      mapInstanceId,
    })

    // The Region detail's history list gains the new row.
    expect(revalidatePath).toHaveBeenCalledWith(
      "/campaigns/camp-short/regions/rgn-short"
    )
  })

  it("stamps the Region's wandering defaults onto the initial dungeon state (D7)", async () => {
    loadRegionRowById.mockResolvedValue(
      makeRegion({
        settings: { wanderingTableKey: "t1", wanderingIntervalTurns: 3 },
      })
    )

    await createExpeditionAction(INPUT)

    const [dungeonInput] = createDungeon.mock.calls[0]!
    const state = dungeonInput.state as DungeonState
    expect(state.reminderSettings.randomEncounters).toEqual({
      enabled: true,
      intervalTurns: 3,
    })
  })

  it("falls back to the delve default cadence when the Region designates no table", async () => {
    // settings: {} — no wandering table, no cadence override.
    await createExpeditionAction(INPUT)

    const [dungeonInput] = createDungeon.mock.calls[0]!
    const state = dungeonInput.state as DungeonState
    expect(state.reminderSettings.randomEncounters).toEqual({
      enabled: false,
      intervalTurns: 6,
    })
  })
})
