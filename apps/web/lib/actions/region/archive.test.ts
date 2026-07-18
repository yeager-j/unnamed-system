import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { RegionRow } from "@/lib/db/schema/region"

import { archiveRegionAction } from "./archive"

// Stub every seam — region lookup, DM gate, guarded archive write, revalidate — so
// this is a pure unit of the archive orchestration.
const requireCampaignDM = vi.fn()
const loadRegionRowById = vi.fn()
const archiveRegion = vi.fn()
const revalidateRegion = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  loadRegionRowById: (id: string) => loadRegionRowById(id),
}))
vi.mock("@/lib/db/writes/region", () => ({
  archiveRegion: (id: string, version: number) => archiveRegion(id, version),
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
    version: 0,
  } as RegionRow
}

const validInput = { regionId: REGION_ID, expectedVersion: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  loadRegionRowById.mockResolvedValue(region())
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    shortId: "camp-short",
  })
  archiveRegion.mockResolvedValue(ok({ version: 1 }))
})

describe("archiveRegionAction", () => {
  it("returns region-not-found when the row is gone (before auth)", async () => {
    loadRegionRowById.mockResolvedValue(null)

    const result = await archiveRegionAction(validInput)

    expect(result).toEqual({ ok: false, error: "region-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("lets a non-DM rejection from the gate propagate", async () => {
    requireCampaignDM.mockRejectedValue(FORBIDDEN)

    await expect(archiveRegionAction(validInput)).rejects.toBe(FORBIDDEN)
    expect(archiveRegion).not.toHaveBeenCalled()
  })

  it("archives and revalidates on success", async () => {
    const result = await archiveRegionAction(validInput)

    expect(result).toEqual(ok({ version: 1 }))
    expect(archiveRegion).toHaveBeenCalledWith(REGION_ID, 0)
    expect(revalidateRegion).toHaveBeenCalledWith({
      campaignShortId: "camp-short",
      regionShortId: "rgn-short",
    })
  })

  it("propagates a stale guarded-write error", async () => {
    archiveRegion.mockResolvedValue(err("stale"))

    const result = await archiveRegionAction(validInput)

    expect(result).toEqual(err("stale"))
    expect(revalidateRegion).not.toHaveBeenCalled()
  })
})
