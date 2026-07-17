import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { moveBeatToFolderAction } from "./move-item"

const requireCampaignDM = vi.fn()
const moveBeatToFolder = vi.fn()
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/campaign-folders", () => ({
  moveArticleToFolder: vi.fn(),
  moveNpcToFolder: vi.fn(),
  moveBeatToFolder: (input: unknown) => moveBeatToFolder(input),
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
  moveBeatToFolder.mockResolvedValue(ok(undefined))
})

describe("moveBeatToFolderAction", () => {
  it("re-files scoped to the gated campaign's id (write-boundary rule)", async () => {
    const result = await moveBeatToFolderAction({
      campaignId: "client-supplied",
      beatId: "beat-1",
      folderId: "session-2",
    })

    expect(result).toEqual(ok(undefined))
    expect(moveBeatToFolder).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      beatId: "beat-1",
      folderId: "session-2",
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  it("floats a beat to Unfiled with a null folder", async () => {
    await moveBeatToFolderAction({
      campaignId: "c",
      beatId: "beat-1",
      folderId: null,
    })

    expect(moveBeatToFolder).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      beatId: "beat-1",
      folderId: null,
    })
  })

  it("passes a foreign-folder refusal through without revalidating", async () => {
    moveBeatToFolder.mockResolvedValue(err("folder-not-found"))

    const result = await moveBeatToFolderAction({
      campaignId: "c",
      beatId: "beat-1",
      folderId: "an-npc-folder",
    })

    expect(result).toEqual(err("folder-not-found"))
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
