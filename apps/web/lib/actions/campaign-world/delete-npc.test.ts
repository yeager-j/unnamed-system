import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { deleteNpcAction } from "./delete-npc"

const requireCampaignDM = vi.fn()
const softDeleteNpc = vi.fn()
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/campaign-world", () => ({
  softDeleteNpc: (input: unknown) => softDeleteNpc(input),
}))
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
  softDeleteNpc.mockResolvedValue(ok(undefined))
})

describe("deleteNpcAction", () => {
  it("deletes scoped to the gated campaign's id (write-boundary rule)", async () => {
    const result = await deleteNpcAction({
      campaignId: "client-supplied",
      entityId: "entity-1",
    })

    expect(result).toEqual(ok(undefined))
    expect(softDeleteNpc).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      entityId: "entity-1",
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  it("passes a forged-id miss through without revalidating", async () => {
    softDeleteNpc.mockResolvedValue(err("npc-not-found"))

    const result = await deleteNpcAction({
      campaignId: "client-supplied",
      entityId: "someone-elses-npc",
    })

    expect(result).toEqual(err("npc-not-found"))
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
