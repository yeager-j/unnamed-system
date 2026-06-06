import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game/foundation/result"

import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { CharacterRow } from "@/lib/db/schema/character"

import { setCharacterCampaignAction } from "./set-character-campaign"

// The action touches four seams: the owner gate, the target-campaign lookup, the
// membership check, and the placement write. Stub all of them (plus the
// `next/cache` + `next/navigation` server primitives) so this is a pure unit test
// of the **authorization orchestration** — the security property the ticket
// exists to enforce. `forbidden()` throws a sentinel so refusals are assertable.
const requireOwner = vi.fn()
const loadCampaignRowById = vi.fn()
const isCampaignMember = vi.fn()
const setCharacterCampaign = vi.fn()

class ForbiddenError extends Error {}

vi.mock("@/lib/auth/viewer-role", () => ({
  requireOwner: (id: string) => requireOwner(id),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignRowById: (id: string) => loadCampaignRowById(id),
  isCampaignMember: (campaignId: string, userId: string) =>
    isCampaignMember(campaignId, userId),
}))
vi.mock("@/lib/db/writes/campaign-placement", () => ({
  setCharacterCampaign: (
    characterId: string,
    current: string | null,
    next: string | null
  ) => setCharacterCampaign(characterId, current, next),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new ForbiddenError("forbidden")
  },
}))

const OWNER_ID = "owner-1"
const CHARACTER_ID = "char-1"
const TARGET_CAMPAIGN_ID = "campaign-target"

/** The owner's character, currently placed in `campaignId` (null = unplaced). */
function ownedCharacter(campaignId: string | null): CharacterRow {
  return { id: CHARACTER_ID, ownerId: OWNER_ID, campaignId } as CharacterRow
}

/** A target campaign run by `dmUserId`. */
function campaign(dmUserId: string): CampaignRow {
  return { id: TARGET_CAMPAIGN_ID, dmUserId } as CampaignRow
}

beforeEach(() => {
  vi.clearAllMocks()
  setCharacterCampaign.mockResolvedValue(ok(undefined))
})

describe("setCharacterCampaignAction — target-membership gate", () => {
  it("refuses to place into a campaign the owner is neither DM nor member of", async () => {
    requireOwner.mockResolvedValue(ownedCharacter(null))
    loadCampaignRowById.mockResolvedValue(campaign("some-other-dm"))
    isCampaignMember.mockResolvedValue(false)

    await expect(
      setCharacterCampaignAction({
        characterId: CHARACTER_ID,
        campaignId: TARGET_CAMPAIGN_ID,
      })
    ).rejects.toBeInstanceOf(ForbiddenError)

    // The placement write never runs once authorization fails.
    expect(setCharacterCampaign).not.toHaveBeenCalled()
  })

  it("refuses when the target campaign does not exist", async () => {
    requireOwner.mockResolvedValue(ownedCharacter(null))
    loadCampaignRowById.mockResolvedValue(null)

    await expect(
      setCharacterCampaignAction({
        characterId: CHARACTER_ID,
        campaignId: TARGET_CAMPAIGN_ID,
      })
    ).rejects.toBeInstanceOf(ForbiddenError)
    expect(setCharacterCampaign).not.toHaveBeenCalled()
  })

  it("allows a member of the target campaign to place", async () => {
    requireOwner.mockResolvedValue(ownedCharacter(null))
    loadCampaignRowById.mockResolvedValue(campaign("some-other-dm"))
    isCampaignMember.mockResolvedValue(true)

    const result = await setCharacterCampaignAction({
      characterId: CHARACTER_ID,
      campaignId: TARGET_CAMPAIGN_ID,
    })

    expect(result.ok).toBe(true)
    expect(setCharacterCampaign).toHaveBeenCalledWith(
      CHARACTER_ID,
      null,
      TARGET_CAMPAIGN_ID
    )
  })

  it("allows the DM of the target campaign to place their own character (GMPC)", async () => {
    requireOwner.mockResolvedValue(ownedCharacter(null))
    loadCampaignRowById.mockResolvedValue(campaign(OWNER_ID))

    const result = await setCharacterCampaignAction({
      characterId: CHARACTER_ID,
      campaignId: TARGET_CAMPAIGN_ID,
    })

    expect(result.ok).toBe(true)
    // The DM match short-circuits before the membership query.
    expect(isCampaignMember).not.toHaveBeenCalled()
    expect(setCharacterCampaign).toHaveBeenCalled()
  })

  it("unplacing skips the membership gate entirely", async () => {
    requireOwner.mockResolvedValue(ownedCharacter(TARGET_CAMPAIGN_ID))

    const result = await setCharacterCampaignAction({
      characterId: CHARACTER_ID,
      campaignId: null,
    })

    expect(result.ok).toBe(true)
    expect(loadCampaignRowById).not.toHaveBeenCalled()
    expect(setCharacterCampaign).toHaveBeenCalledWith(
      CHARACTER_ID,
      TARGET_CAMPAIGN_ID,
      null
    )
  })

  it("surfaces a live-encounter-lock from the write", async () => {
    requireOwner.mockResolvedValue(ownedCharacter(TARGET_CAMPAIGN_ID))
    setCharacterCampaign.mockResolvedValue(err("live-encounter-lock"))

    const result = await setCharacterCampaignAction({
      characterId: CHARACTER_ID,
      campaignId: null,
    })

    expect(result).toEqual(err("live-encounter-lock"))
  })
})
