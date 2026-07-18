import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LoadedPlayerCharacter } from "@/lib/db/queries/load-player-character"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { EntityRow } from "@/lib/db/schema/entity"
import type { PlayerCharacterRow } from "@/lib/db/schema/player-character"

import {
  authorizeEntityWriteForClass,
  requireOwnerOrCampaignDMForEntity,
} from "./campaign-access"

// The gate touches three seams: the session (`auth` from ./index), the PC loader
// (entity ⋈ subtype), and the campaign loader. Stub all three so this stays a pure
// unit test with no next-auth / DB chain. `forbidden()` normally throws a Next
// redirect-class error; stub it to throw a sentinel so rejections are assertable.
const auth = vi.fn()
const loadPlayerCharacterById = vi.fn()
const loadCampaignRowById = vi.fn()

vi.mock("./index", () => ({ auth: () => auth() }))
vi.mock("@/lib/db/queries/load-player-character", () => ({
  loadPlayerCharacterById: (id: string) => loadPlayerCharacterById(id),
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

/** A loaded player character (its subtype row carrying the `entity` substrate), as
 *  the gate reads it. Only `userId`/`campaignId` drive authorization. */
function makePc(subtype: Partial<PlayerCharacterRow>): LoadedPlayerCharacter {
  return {
    entityId: ENTITY_ID,
    userId: OWNER_ID,
    campaignId: null,
    ...subtype,
    entity: { id: ENTITY_ID } as EntityRow,
  } as LoadedPlayerCharacter
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
    loadPlayerCharacterById.mockReset()
    loadCampaignRowById.mockReset()
  })

  it("allows the owner and returns the pair without a campaign query", async () => {
    signedInAs(OWNER_ID)
    const pc = makePc({ userId: OWNER_ID, campaignId: CAMPAIGN_ID })
    loadPlayerCharacterById.mockResolvedValue(pc)

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).resolves.toBe(pc)
    expect(loadCampaignRowById).not.toHaveBeenCalled()
  })

  it("allows the campaign DM of a non-owner's character", async () => {
    signedInAs(DM_ID)
    const pc = makePc({ userId: OWNER_ID, campaignId: CAMPAIGN_ID })
    loadPlayerCharacterById.mockResolvedValue(pc)
    loadCampaignRowById.mockResolvedValue(makeCampaign({ dmUserId: DM_ID }))

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).resolves.toBe(pc)
    expect(loadCampaignRowById).toHaveBeenCalledWith(CAMPAIGN_ID)
  })

  it("forbids a missing session", async () => {
    auth.mockResolvedValue(null)

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).rejects.toThrow(
      "forbidden"
    )
    expect(loadPlayerCharacterById).not.toHaveBeenCalled()
  })

  it("forbids a missing PC subtype", async () => {
    signedInAs(OWNER_ID)
    loadPlayerCharacterById.mockResolvedValue(null)

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).rejects.toThrow(
      "forbidden"
    )
  })

  it("forbids a non-owner whose character has no campaign (no campaign query)", async () => {
    signedInAs(OTHER_ID)
    loadPlayerCharacterById.mockResolvedValue(
      makePc({ userId: OWNER_ID, campaignId: null })
    )

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).rejects.toThrow(
      "forbidden"
    )
    expect(loadCampaignRowById).not.toHaveBeenCalled()
  })

  it("forbids a signed-in user who is not the campaign's DM", async () => {
    signedInAs(OTHER_ID)
    loadPlayerCharacterById.mockResolvedValue(
      makePc({ userId: OWNER_ID, campaignId: CAMPAIGN_ID })
    )
    loadCampaignRowById.mockResolvedValue(makeCampaign({ dmUserId: DM_ID }))

    await expect(requireOwnerOrCampaignDMForEntity(ENTITY_ID)).rejects.toThrow(
      "forbidden"
    )
  })
})

describe("authorizeEntityWriteForClass — the class → posture policy (UNN-645)", () => {
  beforeEach(() => {
    auth.mockReset()
    loadPlayerCharacterById.mockReset()
    loadCampaignRowById.mockReset()
  })

  it("refuses (typed, no throw) without a session", async () => {
    auth.mockResolvedValue(null)
    await expect(
      authorizeEntityWriteForClass(ENTITY_ID, "vitals")
    ).resolves.toEqual({ ok: false, error: "forbidden" })
  })

  it("admits the owner on every class without loading the campaign", async () => {
    signedInAs(OWNER_ID)
    const pc = makePc({ userId: OWNER_ID, campaignId: CAMPAIGN_ID })
    loadPlayerCharacterById.mockResolvedValue(pc)

    const result = await authorizeEntityWriteForClass(ENTITY_ID, "identity")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(pc)
    expect(loadCampaignRowById).not.toHaveBeenCalled()
  })

  it("admits the placed campaign's DM on the vitals class only", async () => {
    signedInAs(DM_ID)
    loadPlayerCharacterById.mockResolvedValue(
      makePc({ userId: OWNER_ID, campaignId: CAMPAIGN_ID })
    )
    loadCampaignRowById.mockResolvedValue(makeCampaign({ dmUserId: DM_ID }))

    const vitals = await authorizeEntityWriteForClass(ENTITY_ID, "vitals")
    expect(vitals.ok).toBe(true)

    const identity = await authorizeEntityWriteForClass(ENTITY_ID, "identity")
    expect(identity).toEqual({ ok: false, error: "forbidden" })
  })

  it("refuses a stranger even on vitals", async () => {
    signedInAs(OTHER_ID)
    loadPlayerCharacterById.mockResolvedValue(
      makePc({ userId: OWNER_ID, campaignId: CAMPAIGN_ID })
    )
    loadCampaignRowById.mockResolvedValue(makeCampaign({ dmUserId: DM_ID }))

    await expect(
      authorizeEntityWriteForClass(ENTITY_ID, "vitals")
    ).resolves.toEqual({ ok: false, error: "forbidden" })
  })
})
