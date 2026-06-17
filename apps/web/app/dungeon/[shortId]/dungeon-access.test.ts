import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import { getDungeonForDM } from "./dungeon-access"

// Stub the four seams `getDungeonForDM` resolves: the session, the dungeon row,
// its campaign, and its Map Instance. The gate logic itself runs for real, so the
// test asserts the DM-only / no-existence-leak contract end to end. Each case uses
// a **distinct** shortId so React `cache()` memoization never bleeds across tests.
const auth = vi.fn()
const loadDungeonRowByShortId = vi.fn()
const loadCampaignRowById = vi.fn()
const loadMapInstanceById = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: () => auth(),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowByShortId: (shortId: string) =>
    loadDungeonRowByShortId(shortId),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignRowById: (id: string) => loadCampaignRowById(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))

const DM_ID = "dm-user"

const dungeonRow = (shortId: string): DungeonRow =>
  ({
    id: `dungeon-${shortId}`,
    shortId,
    campaignId: "campaign-1",
    mapInstanceId: "mi-1",
    name: "Delve",
    status: "active",
    state: {
      turnCounter: 0,
      actedCharacterIds: [],
      reminderSettings: {
        randomEncounters: { enabled: false, intervalTurns: 6 },
      },
    },
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) satisfies DungeonRow

const campaignRow = (dmUserId: string): CampaignRow =>
  ({
    id: "campaign-1",
    shortId: "camp-1",
    joinToken: "tok",
    dmUserId,
    name: "Campaign",
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) satisfies CampaignRow

const instanceRow: MapInstanceRow = {
  id: "mi-1",
  mapId: null,
  state: { zones: {}, adjacency: {}, occupancy: {}, enchantment: null },
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  auth.mockReset().mockResolvedValue({ user: { id: DM_ID } })
  loadDungeonRowByShortId.mockReset()
  loadCampaignRowById.mockReset().mockResolvedValue(campaignRow(DM_ID))
  loadMapInstanceById.mockReset().mockResolvedValue(instanceRow)
})

describe("getDungeonForDM", () => {
  it("returns the dungeon + its Instance for the campaign DM", async () => {
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("ok-dm"))

    const result = await getDungeonForDM("ok-dm")

    expect(result).toEqual({
      dungeon: dungeonRow("ok-dm"),
      instance: instanceRow,
    })
  })

  it("returns null when signed out (no leak of existence)", async () => {
    auth.mockResolvedValue(null)
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("signed-out"))

    expect(await getDungeonForDM("signed-out")).toBeNull()
  })

  it("returns null when no dungeon matches the shortId", async () => {
    loadDungeonRowByShortId.mockResolvedValue(null)

    expect(await getDungeonForDM("missing")).toBeNull()
  })

  it("returns null for a viewer who is not the campaign DM (non-member/non-DM)", async () => {
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("not-dm"))
    loadCampaignRowById.mockResolvedValue(campaignRow("someone-else"))

    expect(await getDungeonForDM("not-dm")).toBeNull()
  })

  it("returns null when the referenced Map Instance is missing (integrity fault)", async () => {
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("no-instance"))
    loadMapInstanceById.mockResolvedValue(null)

    expect(await getDungeonForDM("no-instance")).toBeNull()
  })
})
