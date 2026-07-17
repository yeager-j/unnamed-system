import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { deleteCampaignAction } from "./delete-campaign"

// Stub the DM gate + write so this is a pure unit test of the
// name-confirmation + live-encounter orchestration.
const requireCampaignDM = vi.fn()
const deleteCampaign = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/campaign", () => ({
  deleteCampaign: (id: string) => deleteCampaign(id),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const CAMPAIGN_ID = "campaign-1"
const CAMPAIGN_NAME = "The Sunless Reach"

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({
    id: CAMPAIGN_ID,
    name: CAMPAIGN_NAME,
  } as CampaignRow)
  deleteCampaign.mockResolvedValue(ok(undefined))
})

describe("deleteCampaignAction", () => {
  it("deletes when the typed name matches", async () => {
    const result = await deleteCampaignAction({
      campaignId: CAMPAIGN_ID,
      confirmationName: CAMPAIGN_NAME,
    })

    expect(result.ok).toBe(true)
    expect(deleteCampaign).toHaveBeenCalledWith(CAMPAIGN_ID)
  })

  it("refuses a name mismatch and never deletes", async () => {
    const result = await deleteCampaignAction({
      campaignId: CAMPAIGN_ID,
      confirmationName: "wrong name",
    })

    expect(result).toEqual(err("name-mismatch"))
    expect(deleteCampaign).not.toHaveBeenCalled()
  })

  it("surfaces the live-encounter guard from the write", async () => {
    deleteCampaign.mockResolvedValue(err("live-encounter-exists"))

    const result = await deleteCampaignAction({
      campaignId: CAMPAIGN_ID,
      confirmationName: CAMPAIGN_NAME,
    })

    expect(result).toEqual(err("live-encounter-exists"))
  })
})
