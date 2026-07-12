import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/game-v2/kernel/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { mintNpcAction } from "./mint-npc"

// Stub the DM gate + write so this is a pure unit test of the parse →
// gate → write orchestration, especially the write-boundary rule: the write
// receives the GATED campaign's id, never a client-supplied one.
const requireCampaignDM = vi.fn()
const mintNpc = vi.fn()

// `server-only` (via ./revalidate) throws outside a React Server environment
// (the `derive-viewer.test.ts` pattern).
vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/campaign-world", () => ({
  mintNpc: (input: unknown) => mintNpc(input),
}))
const revalidatePath = vi.fn()
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const GATED_CAMPAIGN_ID = "gated-campaign-id"

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({
    id: GATED_CAMPAIGN_ID,
    shortId: "camp1234",
  } as CampaignRow)
  mintNpc.mockResolvedValue({ entityId: "entity-1", shortId: "npc12345" })
})

describe("mintNpcAction", () => {
  it("mints with the gated campaign's id (write-boundary rule)", async () => {
    const result = await mintNpcAction({
      campaignId: "whatever-the-client-sent",
      name: "  Maren the Hollow  ",
    })

    expect(result).toEqual(ok({ entityId: "entity-1", shortId: "npc12345" }))
    expect(requireCampaignDM).toHaveBeenCalledWith("whatever-the-client-sent")
    expect(mintNpc).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      name: "Maren the Hollow",
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  it("rejects an empty name before gating", async () => {
    const result = await mintNpcAction({ campaignId: "camp", name: "   " })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(mintNpc).not.toHaveBeenCalled()
  })
})
