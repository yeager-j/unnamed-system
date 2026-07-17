import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"

import { createFolderAction, moveFolderAction } from "./folder"

const requireCampaignDM = vi.fn()
const createFolder = vi.fn()
const moveFolder = vi.fn()
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/writes/campaign-folders", () => ({
  createFolder: (input: unknown) => createFolder(input),
  renameFolder: vi.fn(),
  moveFolder: (input: unknown) => moveFolder(input),
  deleteFolder: vi.fn(),
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
  createFolder.mockResolvedValue(ok({ id: "folder-1" }))
  moveFolder.mockResolvedValue(ok(undefined))
})

describe("createFolderAction", () => {
  it("creates scoped to the gated campaign's id (write-boundary rule)", async () => {
    const result = await createFolderAction({
      campaignId: "client-supplied",
      kind: "article",
      name: "Places",
      parentId: null,
    })

    expect(result).toEqual(ok({ id: "folder-1" }))
    expect(createFolder).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      kind: "article",
      name: "Places",
      parentId: null,
    })
    expect(revalidatePath).toHaveBeenCalled()
  })

  it("creates a session folder — the notes rail rides the same action (UNN-617)", async () => {
    const result = await createFolderAction({
      campaignId: "client-supplied",
      kind: "session",
      name: "Session 4",
      parentId: null,
    })

    expect(result).toEqual(ok({ id: "folder-1" }))
    expect(createFolder).toHaveBeenCalledWith({
      campaignId: GATED_CAMPAIGN_ID,
      kind: "session",
      name: "Session 4",
      parentId: null,
    })
  })

  it("rejects an unknown kind at the wire", async () => {
    const result = await createFolderAction({
      campaignId: "c",
      // @ts-expect-error — the wire is untrusted
      kind: "dungeon",
      name: "Places",
      parentId: null,
    })
    expect(result).toEqual(err("invalid-input"))
    expect(createFolder).not.toHaveBeenCalled()
  })
})

describe("moveFolderAction", () => {
  it("passes the cycle refusal through without revalidating", async () => {
    moveFolder.mockResolvedValue(err("folder-cycle"))

    const result = await moveFolderAction({
      campaignId: "c",
      folderId: "f1",
      parentId: "f1-child",
    })

    expect(result).toEqual(err("folder-cycle"))
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
