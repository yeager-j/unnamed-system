import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@/lib/result"

import { leaveCampaignAction } from "./leave-campaign"

// Stub the auth + write seams so this is a pure unit test of the orchestration.
// `unauthorized()` throws a sentinel so the signed-out rejection is assertable.
const auth = vi.fn()
const removeCampaignMember = vi.fn()

class UnauthorizedError extends Error {}

vi.mock("@/lib/auth", () => ({ auth: () => auth() }))
vi.mock("@/lib/db/writes/campaign", () => ({
  removeCampaignMember: (campaignId: string, userId: string) =>
    removeCampaignMember(campaignId, userId),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  unauthorized: () => {
    throw new UnauthorizedError("unauthorized")
  },
}))

const CAMPAIGN_ID = "campaign-1"
const USER_ID = "user-1"

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: USER_ID } })
  removeCampaignMember.mockResolvedValue(ok(undefined))
})

describe("leaveCampaignAction", () => {
  it("removes the signed-in viewer's own membership", async () => {
    const result = await leaveCampaignAction({ campaignId: CAMPAIGN_ID })

    expect(result.ok).toBe(true)
    expect(removeCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID)
  })

  it("bounces a signed-out caller and never writes", async () => {
    auth.mockResolvedValue(null)

    await expect(
      leaveCampaignAction({ campaignId: CAMPAIGN_ID })
    ).rejects.toBeInstanceOf(UnauthorizedError)
    expect(removeCampaignMember).not.toHaveBeenCalled()
  })

  it("surfaces the live-encounter lock from the write", async () => {
    removeCampaignMember.mockResolvedValue(err("live-encounter-lock"))

    const result = await leaveCampaignAction({ campaignId: CAMPAIGN_ID })

    expect(result).toEqual(err("live-encounter-lock"))
  })
})
