import { beforeEach, describe, expect, it, vi } from "vitest"

import { deriveViewer } from "./derive-viewer"

// The mint touches two seams: the session (`auth` from ./index) and the
// membership probe. Stub both so this stays a pure unit test — the point is
// that every Viewer field derives from those server seams and nothing else
// (UNN-530 AC: never from client input). `server-only` throws outside a React
// Server environment, so it is mocked away (the `restricted.test.ts` pattern).
vi.mock("server-only", () => ({}))

const auth = vi.fn()
const isCampaignMember = vi.fn()

vi.mock("./index", () => ({ auth: () => auth() }))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  isCampaignMember: (campaignId: string, userId: string) =>
    isCampaignMember(campaignId, userId),
}))

const DM_ID = "user-dm"
const PLAYER_ID = "user-player"
const CAMPAIGN = { id: "campaign-1", dmUserId: DM_ID }

const signedInAs = (userId: string | null) =>
  auth.mockResolvedValue(userId ? { user: { id: userId } } : null)

describe("deriveViewer — the server-side TrustedViewer mint (UNN-530)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isCampaignMember.mockResolvedValue(false)
  })

  it("signed-out → sideless spectator that owns nothing", async () => {
    signedInAs(null)

    const viewer = await deriveViewer({
      campaign: CAMPAIGN,
      durableOwners: new Map([["char-a", PLAYER_ID]]),
    })

    expect(viewer).toEqual({
      isDm: false,
      side: null,
      ownedEntityIds: new Set(),
    })
    expect(isCampaignMember).not.toHaveBeenCalled()
  })

  it("the campaign's DM → isDm, no membership probe", async () => {
    signedInAs(DM_ID)

    const viewer = await deriveViewer({
      campaign: CAMPAIGN,
      durableOwners: new Map(),
    })

    expect(viewer.isDm).toBe(true)
    expect(isCampaignMember).not.toHaveBeenCalled()
  })

  it("a member whose PC sat the encounter out → players side, owns nothing", async () => {
    signedInAs(PLAYER_ID)
    isCampaignMember.mockResolvedValue(true)

    const viewer = await deriveViewer({
      campaign: CAMPAIGN,
      durableOwners: new Map([["char-a", "someone-else"]]),
    })

    expect(viewer).toEqual({
      isDm: false,
      side: "players",
      ownedEntityIds: new Set(),
    })
    expect(isCampaignMember).toHaveBeenCalledWith(CAMPAIGN.id, PLAYER_ID)
  })

  it("owning a durable participant implies the players side without a membership probe", async () => {
    signedInAs(PLAYER_ID)

    const viewer = await deriveViewer({
      campaign: CAMPAIGN,
      durableOwners: new Map([
        ["char-a", PLAYER_ID],
        ["char-b", "someone-else"],
      ]),
    })

    expect(viewer).toEqual({
      isDm: false,
      side: "players",
      ownedEntityIds: new Set(["char-a"]),
    })
    expect(isCampaignMember).not.toHaveBeenCalled()
  })

  it("a signed-in stranger to the campaign → sideless spectator", async () => {
    signedInAs("user-stranger")

    const viewer = await deriveViewer({
      campaign: CAMPAIGN,
      durableOwners: new Map([["char-a", PLAYER_ID]]),
    })

    expect(viewer).toEqual({
      isDm: false,
      side: null,
      ownedEntityIds: new Set(),
    })
  })
})
