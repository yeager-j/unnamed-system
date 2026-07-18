import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

import type { RegionRow } from "@/lib/db/schema/region"

import { deleteRegionAction } from "./delete"

// Stub every seam — region lookup, DM gate, the has-expeditions guard, the hard
// delete, and revalidate — so this is a pure unit of the delete orchestration.
const requireCampaignDM = vi.fn()
const loadRegionRowById = vi.fn()
const regionHasExpeditions = vi.fn()
const hardDeleteRegion = vi.fn()
const revalidateRegion = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  loadRegionRowById: (id: string) => loadRegionRowById(id),
  regionHasExpeditions: (id: string) => regionHasExpeditions(id),
}))
vi.mock("@/lib/db/writes/region", () => ({
  hardDeleteRegion: (id: string) => hardDeleteRegion(id),
}))
vi.mock("./revalidate", () => ({
  revalidateRegion: (region: unknown) => revalidateRegion(region),
}))

const REGION_ID = "region-1"
const CAMPAIGN_ID = "campaign-1"
const FORBIDDEN = new Error("forbidden")

function region(): RegionRow {
  return {
    id: REGION_ID,
    shortId: "rgn-short",
    campaignId: CAMPAIGN_ID,
  } as RegionRow
}

const validInput = { regionId: REGION_ID }

beforeEach(() => {
  vi.clearAllMocks()
  loadRegionRowById.mockResolvedValue(region())
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    shortId: "camp-short",
  })
  regionHasExpeditions.mockResolvedValue(false)
})

describe("deleteRegionAction", () => {
  it("returns region-not-found when the row is gone (before auth)", async () => {
    loadRegionRowById.mockResolvedValue(null)

    const result = await deleteRegionAction(validInput)

    expect(result).toEqual({ ok: false, error: "region-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    requireCampaignDM.mockRejectedValue(FORBIDDEN)

    await expect(deleteRegionAction(validInput)).rejects.toBe(FORBIDDEN)
    expect(hardDeleteRegion).not.toHaveBeenCalled()
  })

  it("refuses when the Region has expeditions (including tombstoned)", async () => {
    regionHasExpeditions.mockResolvedValue(true)

    const result = await deleteRegionAction(validInput)

    expect(result).toEqual({ ok: false, error: "region-has-expeditions" })
    expect(hardDeleteRegion).not.toHaveBeenCalled()
  })

  it("hard-deletes and revalidates when the Region has no expeditions", async () => {
    const result = await deleteRegionAction(validInput)

    expect(result).toEqual(ok(undefined))
    expect(hardDeleteRegion).toHaveBeenCalledWith(REGION_ID)
    expect(revalidateRegion).toHaveBeenCalledWith({
      campaignShortId: "camp-short",
      regionShortId: "rgn-short",
    })
  })
})
