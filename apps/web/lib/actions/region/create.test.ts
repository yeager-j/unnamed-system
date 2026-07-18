import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MapRow } from "@/lib/db/schema/map"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"

import { createRegionAction } from "./create"

// Mock the game-v2 generation seam so the concurrent engine work can't block this
// unit: `regionSettingsSchema` (imported by create.schema) becomes a local zod
// stand-in that mirrors the real shape closely enough to parse the inputs. Every
// other seam — the DM gate, the Map/Set lookups, the write, and the revalidate —
// is stubbed so this tests only the create orchestration. `requireCampaignDM`
// throws a sentinel on the non-DM path and returns a campaign row (with
// `dmUserId` + `shortId`) on success.
vi.mock("@workspace/game-v2/generation", async () => {
  const { z } = await import("zod/v4")
  return {
    regionSettingsSchema: z.object({
      wanderingTableKey: z.string().optional(),
      wanderingIntervalTurns: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(6)])
        .optional(),
    }),
  }
})

const requireCampaignDM = vi.fn()
const loadMapByShortId = vi.fn()
const loadTemplateSetByShortId = vi.fn()
const createRegion = vi.fn()
const revalidateRegion = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-map", () => ({
  loadMapByShortId: (shortId: string) => loadMapByShortId(shortId),
}))
vi.mock("@/lib/db/queries/load-template-set", () => ({
  loadTemplateSetByShortId: (shortId: string) =>
    loadTemplateSetByShortId(shortId),
}))
vi.mock("@/lib/db/writes/region", () => ({
  createRegion: (input: unknown) => createRegion(input),
}))
vi.mock("./revalidate", () => ({
  revalidateRegion: (region: unknown) => revalidateRegion(region),
}))

const CAMPAIGN_ID = "campaign-1"
const DM_ID = "dm-1"
const MAP_SHORT_ID = "mapshort"
const MAP_ID = "map-1"
const SET_SHORT_ID = "setshort"
const SET_ID = "set-1"

const FORBIDDEN = new Error("forbidden")

function map(overrides: Partial<MapRow> = {}): MapRow {
  return {
    id: MAP_ID,
    shortId: MAP_SHORT_ID,
    userId: DM_ID,
    name: "The Slums",
    geometry: { pages: {}, zones: {}, connections: {} },
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as MapRow
}

function templateSet(overrides: Partial<TemplateSetRow> = {}): TemplateSetRow {
  return {
    id: SET_ID,
    shortId: SET_SHORT_ID,
    userId: DM_ID,
    name: "Slums Set",
    content: {
      templates: {},
      tables: { wander: { entries: [] } },
      templateOrder: [],
      tableOrder: ["wander"],
      closureChance: 0.1,
    },
    version: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as TemplateSetRow
}

const validInput = {
  campaignId: CAMPAIGN_ID,
  name: "The Undercity",
  seedMapShortId: MAP_SHORT_ID,
  templateSetShortId: SET_SHORT_ID,
  settings: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    dmUserId: DM_ID,
    shortId: "camp-short",
  })
  loadMapByShortId.mockResolvedValue(map())
  loadTemplateSetByShortId.mockResolvedValue(templateSet())
  createRegion.mockResolvedValue({ id: "region-1", shortId: "rgn-short" })
})

describe("createRegionAction", () => {
  it("rejects an empty name without touching auth", async () => {
    const result = await createRegionAction({ ...validInput, name: "  " })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    requireCampaignDM.mockRejectedValue(FORBIDDEN)

    await expect(createRegionAction(validInput)).rejects.toBe(FORBIDDEN)
    expect(createRegion).not.toHaveBeenCalled()
  })

  it("refuses a Map the DM does not own", async () => {
    loadMapByShortId.mockResolvedValue(map({ userId: "someone-else" }))

    const result = await createRegionAction(validInput)

    expect(result).toEqual({ ok: false, error: "map-not-found" })
    expect(createRegion).not.toHaveBeenCalled()
  })

  it("refuses a missing Map", async () => {
    loadMapByShortId.mockResolvedValue(null)

    const result = await createRegionAction(validInput)

    expect(result).toEqual({ ok: false, error: "map-not-found" })
  })

  it("refuses a foreign Template Set", async () => {
    loadTemplateSetByShortId.mockResolvedValue(
      templateSet({ userId: "someone-else" })
    )

    const result = await createRegionAction(validInput)

    expect(result).toEqual({ ok: false, error: "template-set-not-found" })
    expect(createRegion).not.toHaveBeenCalled()
  })

  it("refuses a deleted/missing Template Set (loader returns null)", async () => {
    loadTemplateSetByShortId.mockResolvedValue(null)

    const result = await createRegionAction(validInput)

    expect(result).toEqual({ ok: false, error: "template-set-not-found" })
  })

  it("refuses an unknown wandering-table key", async () => {
    const result = await createRegionAction({
      ...validInput,
      settings: { wanderingTableKey: "ghosts" },
    })

    expect(result).toEqual({ ok: false, error: "wandering-table-not-found" })
    expect(createRegion).not.toHaveBeenCalled()
  })

  it("accepts a wandering-table key that exists in the set's content", async () => {
    const result = await createRegionAction({
      ...validInput,
      settings: { wanderingTableKey: "wander", wanderingIntervalTurns: 2 },
    })

    expect(result).toEqual({ ok: true, value: { shortId: "rgn-short" } })
    expect(createRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        name: "The Undercity",
        seedMapId: MAP_ID,
        templateSetId: SET_ID,
        settings: { wanderingTableKey: "wander", wanderingIntervalTurns: 2 },
      })
    )
  })

  it("skips set-content validation when no wandering key is set", async () => {
    // A set with no tables at all would fail a key check; with no key, it passes.
    loadTemplateSetByShortId.mockResolvedValue(
      templateSet({
        content: {
          templates: {},
          tables: {},
          templateOrder: [],
          tableOrder: [],
          closureChance: 0.1,
        },
      } as unknown as Partial<TemplateSetRow>)
    )

    const result = await createRegionAction(validInput)

    expect(result).toEqual({ ok: true, value: { shortId: "rgn-short" } })
  })

  it("creates with row ids (not shortIds) and revalidates on success", async () => {
    const result = await createRegionAction(validInput)

    expect(result).toEqual({ ok: true, value: { shortId: "rgn-short" } })
    expect(createRegion).toHaveBeenCalledWith(
      expect.objectContaining({ seedMapId: MAP_ID, templateSetId: SET_ID })
    )
    expect(revalidateRegion).toHaveBeenCalledWith({
      campaignShortId: "camp-short",
      regionShortId: "rgn-short",
    })
  })
})
