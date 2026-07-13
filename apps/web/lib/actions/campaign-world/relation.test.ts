import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { addRelationAction } from "./relation"

const requireCampaignDM = vi.fn()
const validateParticipantRefs = vi.fn()
const addRelation = vi.fn()
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-participants", () => ({
  validateParticipantRefs: (...args: unknown[]) =>
    validateParticipantRefs(...args),
}))
vi.mock("@/lib/db/writes/campaign-world", () => ({
  addRelation: (input: unknown) => addRelation(input),
  removeRelation: vi.fn(),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const GATED_CAMPAIGN_ID = "gated-campaign-id"
const SOURCE = { kind: "npc", id: "npc-1" } as const
const TARGET = { kind: "article", id: "art-1" } as const

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({
    id: GATED_CAMPAIGN_ID,
    shortId: "camp1234",
  } as CampaignRow)
  validateParticipantRefs.mockResolvedValue(ok(undefined))
  addRelation.mockResolvedValue({ id: "rel-1" })
})

describe("addRelationAction", () => {
  it("validates both endpoints against the gated campaign (§5 boundary rule)", async () => {
    const result = await addRelationAction({
      campaignId: "client-supplied",
      source: SOURCE,
      target: TARGET,
      label: "sworn to protect",
      alsoReverse: true,
    })

    expect(result).toEqual(ok({ id: "rel-1" }))
    expect(validateParticipantRefs).toHaveBeenCalledWith(GATED_CAMPAIGN_ID, [
      SOURCE,
      TARGET,
    ])
    expect(addRelation).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      source: SOURCE,
      target: TARGET,
      label: "sworn to protect",
      alsoReverse: true,
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  it("refuses an invalid ref before any row lands", async () => {
    validateParticipantRefs.mockResolvedValue(err("invalid-ref"))

    const result = await addRelationAction({
      campaignId: "c",
      source: SOURCE,
      target: { kind: "npc", id: "foreign" },
      label: null,
      alsoReverse: false,
    })

    expect(result).toEqual(err("invalid-ref"))
    expect(addRelation).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("stores a blank label as null", async () => {
    await addRelationAction({
      campaignId: "c",
      source: SOURCE,
      target: TARGET,
      label: "   ",
      alsoReverse: false,
    })

    expect(addRelation).toHaveBeenCalledWith(
      expect.objectContaining({ label: null })
    )
  })
})
