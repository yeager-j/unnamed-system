import { beforeEach, describe, expect, it, vi } from "vitest"

import { emptyMapInstance } from "@workspace/game-v2/spatial"

import type { MapRow } from "@/lib/db/schema/map"

import { createDungeonAction } from "./create"

// The action touches: the DM gate, the Map-by-shortId lookup, and the two writes
// composed in a `db.transaction`. Stub all of them so this is a pure unit test of
// the orchestration — the create schema + the pure engine mints
// (`createDungeonState`, `emptyMapInstance`) run for real. `requireCampaignDM`
// throws `forbidden()`; stub it to throw a sentinel so the rejection is
// assertable, and to return a campaign row (with `dmUserId`) on success so the
// Map-ownership check has something to compare against. `db.transaction` runs its
// body inline with a sentinel executor.
const requireCampaignDM = vi.fn()
const loadMapByShortId = vi.fn()
const createDungeon = vi.fn()
const insertMapInstance = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-map", () => ({
  loadMapByShortId: (shortId: string) => loadMapByShortId(shortId),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  createDungeon: (input: unknown, tx: unknown) => createDungeon(input, tx),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  insertMapInstance: (
    tx: unknown,
    id: string,
    state: unknown,
    mapId?: string
  ) => insertMapInstance(tx, id, state, mapId),
}))
vi.mock("@/lib/db/client", () => ({
  db: { transaction: async (body: (tx: unknown) => unknown) => body("tx") },
}))

const CAMPAIGN_ID = "campaign-1"
const DM_ID = "dm-1"
const MAP_SHORT_ID = "mapshort"
const MAP_ID = "map-1"

const FORBIDDEN = new Error("forbidden")

function map(overrides: Partial<MapRow> = {}): MapRow {
  return {
    id: MAP_ID,
    shortId: MAP_SHORT_ID,
    userId: DM_ID,
    name: "The Sunken Crypt",
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: {},
      connections: {},
    },
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const validInput = {
  campaignId: CAMPAIGN_ID,
  mapShortId: MAP_SHORT_ID,
  name: "First Delve",
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID, dmUserId: DM_ID })
  loadMapByShortId.mockResolvedValue(map())
  createDungeon.mockResolvedValue({ id: "dungeon-1", shortId: "dgn-short" })
})

describe("createDungeonAction", () => {
  it("rejects an empty name without touching auth", async () => {
    const result = await createDungeonAction({ ...validInput, name: "  " })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    requireCampaignDM.mockRejectedValue(FORBIDDEN)

    await expect(createDungeonAction(validInput)).rejects.toBe(FORBIDDEN)
    expect(createDungeon).not.toHaveBeenCalled()
  })

  it("rejects a Map the DM does not own", async () => {
    loadMapByShortId.mockResolvedValue(map({ userId: "someone-else" }))

    const result = await createDungeonAction(validInput)

    expect(result).toEqual({ ok: false, error: "map-not-found" })
    expect(createDungeon).not.toHaveBeenCalled()
  })

  it("rejects a missing Map", async () => {
    loadMapByShortId.mockResolvedValue(null)

    const result = await createDungeonAction(validInput)

    expect(result).toEqual({ ok: false, error: "map-not-found" })
  })

  it("mints a blank Instance recording the chosen mapId, then the dungeon", async () => {
    const result = await createDungeonAction(validInput)

    expect(result).toEqual({ ok: true, value: { shortId: "dgn-short" } })

    const [, instanceId, state, mapId] = insertMapInstance.mock.calls[0]!
    expect(state).toEqual(emptyMapInstance())
    expect(mapId).toBe(MAP_ID)

    expect(createDungeon).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        name: "First Delve",
        mapInstanceId: instanceId,
        state: expect.objectContaining({ turnCounter: 0 }),
      }),
      "tx"
    )
  })
})
