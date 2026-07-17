import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { saveBeatProseAction } from "./prose"
import { scheduleBeatAction } from "./schedule"

// Orchestration-only unit tests (the `mint-npc.test.ts` pattern): the gate +
// write are stubbed; what's pinned is parse → gate → write-with-the-GATED-id,
// and — the D10 contract this slice exists for — that the prose autosave
// **never revalidates** while the structural schedule action does.
const requireCampaignDM = vi.fn()
const saveBeatProse = vi.fn()
const scheduleBeat = vi.fn()
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/campaign-notes", () => ({
  saveBeatProse: (input: unknown) => saveBeatProse(input),
  scheduleBeat: (input: unknown) => scheduleBeat(input),
  clearBeatSchedule: vi.fn(),
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
  saveBeatProse.mockResolvedValue(ok(undefined))
  scheduleBeat.mockResolvedValue(ok(undefined))
})

describe("saveBeatProseAction", () => {
  it("writes with the gated campaign's id and never revalidates (D10)", async () => {
    const result = await saveBeatProseAction({
      campaignId: "whatever-the-client-sent",
      beatId: "b1",
      body: "Meet [[npc:n1|Maren]].",
    })

    expect(result).toEqual(ok(undefined))
    expect(saveBeatProse).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      beatId: "b1",
      patch: { body: "Meet [[npc:n1|Maren]]." },
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects an empty patch before gating", async () => {
    const result = await saveBeatProseAction({
      campaignId: "camp",
      beatId: "b1",
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("keeps an explicitly empty title in the patch (clearing is a save)", async () => {
    await saveBeatProseAction({ campaignId: "camp", beatId: "b1", title: "" })

    expect(saveBeatProse).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      beatId: "b1",
      patch: { title: "" },
    })
  })
})

describe("scheduleBeatAction", () => {
  it("revalidates the campaign subtree on success (structural write)", async () => {
    const result = await scheduleBeatAction({
      campaignId: "camp",
      beatId: "b1",
      slotId: "s1",
    })

    expect(result).toEqual(ok(undefined))
    expect(scheduleBeat).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      beatId: "b1",
      slotId: "s1",
    })
    expect(revalidatePath).toHaveBeenCalledTimes(1)
  })

  it("does not revalidate on a write failure", async () => {
    scheduleBeat.mockResolvedValue({ ok: false, error: "slot-occupied" })

    const result = await scheduleBeatAction({
      campaignId: "camp",
      beatId: "b1",
      slotId: "s1",
    })

    expect(result).toEqual({ ok: false, error: "slot-occupied" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
