import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { EntityRow } from "@/lib/db/schema/entity"

import { requireOwnerOrCampaignDMForEntity } from "./campaign-access"

// The gate touches three seams: the session (`auth` from ./index), the entity
// loader, and the campaign loader. Stub all three so this stays a pure unit test
// with no next-auth / DB chain. `forbidden()` normally throws a Next
// redirect-class error; stub it to throw a sentinel so rejections are
// assertable.
const auth = vi.fn()
const loadEntityRowById = vi.fn()
const loadCampaignRowById = vi.fn()

vi.mock("./index", () => ({ auth: () => auth() }))
vi.mock("@/lib/db/queries/load-entity", () => ({
  loadEntityRowById: (id: string) => loadEntityRowById(id),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignRowById: (id: string) => loadCampaignRowById(id),
}))
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("forbidden")
  },
}))

const OWNER_ID = "user-owner"
const DM_ID = "user-dm"
const OTHER_ID = "user-other"
const ENTITY_ID = "entity-1"
const CAMPAIGN_ID = "campaign-1"

function makeEntity(overrides: Partial<EntityRow>): EntityRow {
  return {
    id: ENTITY_ID,
    ownerId: OWNER_ID,
    campaignId: null,
    ...overrides,
  } as EntityRow
}

function makeCampaign(overrides: Partial<CampaignRow>): CampaignRow {
  return {
    id: CAMPAIGN_ID,
    dmUserId: DM_ID,
    ...overrides,
  } as CampaignRow
}

function signedInAs(userId: string) {
  auth.mockResolvedValue({ user: { id: userId } })
}

describe("requireOwnerOrCampaignDMForEntity", () => {
  beforeEach(() => {
    auth.mockReset()
    loadEntityRowById.mockReset()
    loadCampaignRowById.mockReset()
  })

  it("allows the owner and returns the row without a campaign query", async () => {
    signedInAs(OWNER_ID)
    const entity = makeEntity({ ownerId: OWNER_ID, campaignId: CAMPAIGN_ID })
    loadEntityRowById.mockResolvedValue(entity)

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).resolves.toBe(
      entity
    )
    expect(loadCampaignRowById).not.toHaveBeenCalled()
  })

  it("allows the campaign DM of a non-owner's character", async () => {
    signedInAs(DM_ID)
    const entity = makeEntity({ ownerId: OWNER_ID, campaignId: CAMPAIGN_ID })
    loadEntityRowById.mockResolvedValue(entity)
    loadCampaignRowById.mockResolvedValue(makeCampaign({ dmUserId: DM_ID }))

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).resolves.toBe(
      entity
    )
    expect(loadCampaignRowById).toHaveBeenCalledWith(CAMPAIGN_ID)
  })

  it("forbids a missing session", async () => {
    auth.mockResolvedValue(null)

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).rejects.toThrow(
      "forbidden"
    )
    expect(loadEntityRowById).not.toHaveBeenCalled()
  })

  it("forbids a missing entity", async () => {
    signedInAs(OWNER_ID)
    loadEntityRowById.mockResolvedValue(null)

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).rejects.toThrow(
      "forbidden"
    )
  })

  it("forbids a non-owner whose character has no campaign (no campaign query)", async () => {
    signedInAs(OTHER_ID)
    loadEntityRowById.mockResolvedValue(
      makeEntity({ ownerId: OWNER_ID, campaignId: null })
    )

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).rejects.toThrow(
      "forbidden"
    )
    expect(loadCampaignRowById).not.toHaveBeenCalled()
  })

  it("forbids a signed-in user who is not the campaign's DM", async () => {
    signedInAs(OTHER_ID)
    loadEntityRowById.mockResolvedValue(
      makeEntity({ ownerId: OWNER_ID, campaignId: CAMPAIGN_ID })
    )
    loadCampaignRowById.mockResolvedValue(makeCampaign({ dmUserId: DM_ID }))

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).rejects.toThrow(
      "forbidden"
    )
  })
})
