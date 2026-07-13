import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game-v2/kernel/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { saveNpcNarrativeAction } from "./npc-prose"

const requireCampaignDM = vi.fn()
const saveNpcNarrativeField = vi.fn()
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/campaign-world", () => ({
  saveNpcName: vi.fn(),
  saveNpcNarrativeField: (input: unknown) => saveNpcNarrativeField(input),
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
  saveNpcNarrativeField.mockResolvedValue(ok(undefined))
})

describe("saveNpcNarrativeAction", () => {
  it("writes one field scoped to the gated campaign, without revalidating (autosave lane)", async () => {
    const result = await saveNpcNarrativeAction({
      campaignId: "client-supplied",
      entityId: "entity-1",
      field: "personality",
      value: "Gruff, but loyal.",
    })

    expect(result).toEqual(ok(undefined))
    expect(saveNpcNarrativeField).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      entityId: "entity-1",
      field: "personality",
      value: "Gruff, but loyal.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects a field outside the narrative schema's enum", async () => {
    const result = await saveNpcNarrativeAction({
      campaignId: "c",
      entityId: "entity-1",
      // @ts-expect-error — the wire is untrusted
      field: "statblock",
      value: "hacked",
    })
    expect(result).toEqual(err("invalid-input"))
    expect(saveNpcNarrativeField).not.toHaveBeenCalled()
  })
})
