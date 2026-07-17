import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { authorWorldUpdateAction } from "./world-update"

const requireCampaignDM = vi.fn()
const validateParticipantRefs = vi.fn()
const authorWorldUpdate = vi.fn()
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-participants", () => ({
  validateParticipantRefs: (...args: unknown[]) =>
    validateParticipantRefs(...args),
}))
vi.mock("@/lib/db/writes/campaign-updates", () => ({
  authorWorldUpdate: (input: unknown) => authorWorldUpdate(input),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const GATED_CAMPAIGN_ID = "gated-campaign-id"
const PRIMARY = { kind: "npc", id: "npc-1" } as const

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({
    id: GATED_CAMPAIGN_ID,
    shortId: "camp1234",
  } as CampaignRow)
  validateParticipantRefs.mockResolvedValue(ok(undefined))
  authorWorldUpdate.mockResolvedValue(ok({ updateId: "u1" }))
})

describe("authorWorldUpdateAction", () => {
  it("validates primary + concerns then writes scoped to the gated campaign", async () => {
    const concerns = [{ kind: "article", id: "art-1" } as const]
    const result = await authorWorldUpdateAction({
      campaignId: "client-supplied",
      primary: PRIMARY,
      body: "The keep has fallen.",
      category: null,
      concerns,
    })

    expect(result).toEqual(ok({ updateId: "u1" }))
    expect(validateParticipantRefs).toHaveBeenCalledWith(GATED_CAMPAIGN_ID, [
      PRIMARY,
      ...concerns,
    ])
    expect(authorWorldUpdate).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      primary: PRIMARY,
      body: "The keep has fallen.",
      category: null,
      concerns,
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('accepts a null primary ("the world") and validates only the concerns', async () => {
    const concerns = [{ kind: "article", id: "art-1" } as const]
    const result = await authorWorldUpdateAction({
      campaignId: "client-supplied",
      primary: null,
      body: "The party delved the Drowned Stair.",
      category: null,
      concerns,
    })

    expect(result).toEqual(ok({ updateId: "u1" }))
    expect(validateParticipantRefs).toHaveBeenCalledWith(
      GATED_CAMPAIGN_ID,
      concerns
    )
    expect(authorWorldUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ primary: null })
    )
  })

  it("refuses an invalid ref before writing", async () => {
    validateParticipantRefs.mockResolvedValue(err("invalid-ref"))

    const result = await authorWorldUpdateAction({
      campaignId: "c",
      primary: PRIMARY,
      body: "body",
      category: null,
      concerns: [],
    })

    expect(result).toEqual(err("invalid-ref"))
    expect(authorWorldUpdate).not.toHaveBeenCalled()
  })

  it("rejects an empty body at the wire", async () => {
    const result = await authorWorldUpdateAction({
      campaignId: "c",
      primary: PRIMARY,
      body: "   ",
      category: null,
      concerns: [],
    })
    expect(result).toEqual(err("invalid-input"))
  })
})
