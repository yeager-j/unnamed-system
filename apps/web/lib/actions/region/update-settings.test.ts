import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { RegionRow } from "@/lib/db/schema/region"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"

import { updateRegionSettingsAction } from "./update-settings"

// Mock the game-v2 generation seam (see create.test) plus every persistence seam,
// so this is a pure unit of the update orchestration: load region → gate →
// wandering-table validation against the region's current set → guarded write.
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
const loadRegionRowById = vi.fn()
const loadTemplateSetRowById = vi.fn()
const updateRegionSettings = vi.fn()
const revalidateRegion = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  loadRegionRowById: (id: string) => loadRegionRowById(id),
}))
vi.mock("@/lib/db/queries/load-template-set", () => ({
  loadTemplateSetRowById: (id: string) => loadTemplateSetRowById(id),
}))
vi.mock("@/lib/db/writes/region", () => ({
  updateRegionSettings: (id: string, patch: unknown, version: number) =>
    updateRegionSettings(id, patch, version),
}))
vi.mock("./revalidate", () => ({
  revalidateRegion: (region: unknown) => revalidateRegion(region),
}))

const REGION_ID = "region-1"
const CAMPAIGN_ID = "campaign-1"
const SET_ID = "set-1"
const FORBIDDEN = new Error("forbidden")

function region(overrides: Partial<RegionRow> = {}): RegionRow {
  return {
    id: REGION_ID,
    shortId: "rgn-short",
    campaignId: CAMPAIGN_ID,
    templateSetId: SET_ID,
    name: "The Undercity",
    seedMapId: "map-1",
    settings: {},
    discoveredSiteKeys: [],
    staticReveal: {},
    archivedAt: null,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RegionRow
}

function templateSet(): TemplateSetRow {
  return {
    id: SET_ID,
    content: {
      templates: {},
      tables: { wander: { entries: [] } },
      templateOrder: [],
      tableOrder: ["wander"],
      closureChance: 0.1,
    },
  } as unknown as TemplateSetRow
}

const validInput = {
  regionId: REGION_ID,
  expectedVersion: 0,
  name: "The Undercity",
  settings: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  loadRegionRowById.mockResolvedValue(region())
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    shortId: "camp-short",
  })
  loadTemplateSetRowById.mockResolvedValue(templateSet())
  updateRegionSettings.mockResolvedValue(ok({ version: 1 }))
})

describe("updateRegionSettingsAction", () => {
  it("rejects an empty name without touching the DB", async () => {
    const result = await updateRegionSettingsAction({
      ...validInput,
      name: "  ",
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadRegionRowById).not.toHaveBeenCalled()
  })

  it("returns region-not-found when the row is gone (before auth)", async () => {
    loadRegionRowById.mockResolvedValue(null)

    const result = await updateRegionSettingsAction(validInput)

    expect(result).toEqual({ ok: false, error: "region-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    requireCampaignDM.mockRejectedValue(FORBIDDEN)

    await expect(updateRegionSettingsAction(validInput)).rejects.toBe(FORBIDDEN)
    expect(updateRegionSettings).not.toHaveBeenCalled()
  })

  it("skips the set load when no wandering key needs validating", async () => {
    const result = await updateRegionSettingsAction(validInput)

    expect(result).toEqual(ok({ version: 1 }))
    expect(loadTemplateSetRowById).not.toHaveBeenCalled()
  })

  it("validates a wandering key against the region's current set", async () => {
    const result = await updateRegionSettingsAction({
      ...validInput,
      settings: { wanderingTableKey: "wander" },
    })

    expect(result).toEqual(ok({ version: 1 }))
    expect(loadTemplateSetRowById).toHaveBeenCalledWith(SET_ID)
  })

  it("refuses an unknown wandering key", async () => {
    const result = await updateRegionSettingsAction({
      ...validInput,
      settings: { wanderingTableKey: "ghosts" },
    })

    expect(result).toEqual({ ok: false, error: "wandering-table-not-found" })
    expect(updateRegionSettings).not.toHaveBeenCalled()
  })

  it("treats a tombstoned set as template-set-not-found only with a key", async () => {
    loadTemplateSetRowById.mockResolvedValue(null)

    const result = await updateRegionSettingsAction({
      ...validInput,
      settings: { wanderingTableKey: "wander" },
    })

    expect(result).toEqual({ ok: false, error: "template-set-not-found" })
  })

  it("propagates a stale guarded-write error", async () => {
    updateRegionSettings.mockResolvedValue(err("stale"))

    const result = await updateRegionSettingsAction(validInput)

    expect(result).toEqual(err("stale"))
    expect(revalidateRegion).not.toHaveBeenCalled()
  })

  it("revalidates on a successful write", async () => {
    await updateRegionSettingsAction(validInput)

    expect(updateRegionSettings).toHaveBeenCalledWith(
      REGION_ID,
      { name: "The Undercity", settings: {} },
      0
    )
    expect(revalidateRegion).toHaveBeenCalledWith({
      campaignShortId: "camp-short",
      regionShortId: "rgn-short",
    })
  })
})
