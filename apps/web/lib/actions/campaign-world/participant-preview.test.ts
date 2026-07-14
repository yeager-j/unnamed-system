import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ParticipantPreview } from "@/domain/planner/participant-preview"
import type { CampaignRow } from "@/lib/db/schema/campaign"

import { getParticipantPreviewAction } from "./participant-preview"

// Stub the DM gate + read: this is a unit test of parse → gate → read, and in
// particular of the boundary rule — the read receives the GATED campaign's id,
// never the client-supplied one (the `mint-npc.test.ts` pattern).
const requireCampaignDM = vi.fn()
const loadParticipantPreview = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-participant-preview", () => ({
  loadParticipantPreview: (campaignId: string, ref: unknown) =>
    loadParticipantPreview(campaignId, ref),
}))

const GATED_CAMPAIGN_ID = "gated-campaign-id"

const MAREN: ParticipantPreview = {
  ref: { kind: "npc", id: "n1" },
  name: "Maren",
  tombstoned: false,
  portraitUrl: null,
  sublabel: "The Moon · Warlock",
  summary: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({
    id: GATED_CAMPAIGN_ID,
    shortId: "camp1234",
  } as CampaignRow)
  loadParticipantPreview.mockResolvedValue(MAREN)
})

describe("getParticipantPreviewAction", () => {
  it("reads the hovered ref against the gated campaign", async () => {
    const result = await getParticipantPreviewAction({
      campaignId: "client-supplied",
      ref: { kind: "npc", id: "n1" },
    })

    expect(requireCampaignDM).toHaveBeenCalledWith("client-supplied")
    expect(loadParticipantPreview).toHaveBeenCalledWith(GATED_CAMPAIGN_ID, {
      kind: "npc",
      id: "n1",
    })
    expect(result).toEqual({ ok: true, value: MAREN })
  })

  it("reports a ref that resolves to nothing", async () => {
    loadParticipantPreview.mockResolvedValue(null)

    const result = await getParticipantPreviewAction({
      campaignId: "campaign-1",
      ref: { kind: "article", id: "a9" },
    })

    expect(result).toEqual({ ok: false, error: "not-found" })
  })

  it("rejects an unknown participant kind before it reaches the gate", async () => {
    const result = await getParticipantPreviewAction({
      campaignId: "campaign-1",
      ref: { kind: "encounter" as "npc", id: "e1" },
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })
})
