import { beforeEach, describe, expect, it, vi } from "vitest"

import { getParticipantPreviewAction } from "@/lib/actions/campaign-world/participant-preview"

import type { ParticipantRef } from "./participant"
import type { ParticipantPreview } from "./participant-preview"
import { fetchParticipantPreview } from "./use-participant-preview"

vi.mock("@/lib/actions/campaign-world/participant-preview", () => ({
  getParticipantPreviewAction: vi.fn(),
}))

const action = vi.mocked(getParticipantPreviewAction)

/**
 * The cache is module-level and deliberately has no reset hook (a rename can't
 * stale it — identity comes from the live resolver). Tests keep to their own
 * campaign id so their keys never collide.
 */
let campaigns = 0

function nextCampaign(): string {
  campaigns += 1
  return `campaign-${campaigns}`
}

function previewOf(ref: ParticipantRef, name: string): ParticipantPreview {
  return {
    ref,
    name,
    tombstoned: false,
    portraitUrl: null,
    sublabel: null,
    summary: null,
    detail: null,
    shortId: null,
    enemies: null,
  }
}

const MAREN: ParticipantRef = { kind: "npc", id: "n1" }

beforeEach(() => {
  action.mockReset()
})

describe("fetchParticipantPreview", () => {
  it("fetches a target once, however often it is hovered", async () => {
    const campaignId = nextCampaign()
    action.mockResolvedValue({ ok: true, value: previewOf(MAREN, "Maren") })

    const first = await fetchParticipantPreview(campaignId, MAREN)
    const second = await fetchParticipantPreview(campaignId, MAREN)

    expect(first?.name).toBe("Maren")
    expect(second).toBe(first)
    expect(action).toHaveBeenCalledOnce()
  })

  it("shares one request between hovers that race", async () => {
    const campaignId = nextCampaign()
    action.mockResolvedValue({ ok: true, value: previewOf(MAREN, "Maren") })

    const [first, second] = await Promise.all([
      fetchParticipantPreview(campaignId, MAREN),
      fetchParticipantPreview(campaignId, MAREN),
    ])

    expect(second).toBe(first)
    expect(action).toHaveBeenCalledOnce()
  })

  it("caches a miss too — a dangling ref is asked about once", async () => {
    const campaignId = nextCampaign()
    action.mockResolvedValue({ ok: false, error: "not-found" })

    expect(await fetchParticipantPreview(campaignId, MAREN)).toBeNull()
    expect(await fetchParticipantPreview(campaignId, MAREN)).toBeNull()
    expect(action).toHaveBeenCalledOnce()
  })

  it("settles a thrown fetch as a miss rather than breaking the page", async () => {
    const campaignId = nextCampaign()
    action.mockRejectedValue(new Error("offline"))

    expect(await fetchParticipantPreview(campaignId, MAREN)).toBeNull()
  })

  it("evicts the oldest entry once the cache is full", async () => {
    const campaignId = nextCampaign()
    action.mockImplementation(async ({ ref }) => ({
      ok: true,
      value: previewOf(ref as ParticipantRef, `NPC ${ref.id}`),
    }))

    // The cap is 200; hovering 201 distinct targets must retire the first.
    for (let index = 0; index <= 200; index += 1) {
      await fetchParticipantPreview(campaignId, {
        kind: "npc",
        id: `n${index}`,
      })
    }
    expect(action).toHaveBeenCalledTimes(201)

    await fetchParticipantPreview(campaignId, { kind: "npc", id: "n200" })
    expect(action).toHaveBeenCalledTimes(201)

    await fetchParticipantPreview(campaignId, { kind: "npc", id: "n0" })
    expect(action).toHaveBeenCalledTimes(202)
  })
})
