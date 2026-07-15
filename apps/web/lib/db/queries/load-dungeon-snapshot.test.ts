import { beforeEach, describe, expect, it, vi } from "vitest"

import { getDungeonSnapshot } from "./load-dungeon-snapshot"

// `getDungeonSnapshot` composes several impure seams around the pure
// `projectDungeonSnapshot`. The **campaign pairing** guard runs *before* the
// projector, so these tests stub the seams (and the projector, whose output the
// pairing tests never reach on a mismatch) and assert the UNN-608 pairing
// contract: a watch URL whose campaign doesn't own the delve 404s; the flat poll
// API (no campaign passed) skips the check.
const projectDungeonSnapshot = vi.fn()
const loadDungeonRowByShortId = vi.fn()
const loadCampaignRowById = vi.fn()
const loadMapInstanceById = vi.fn()
const loadPlacedCharactersForCampaign = vi.fn()
const loadLiveEncounterForMapInstance = vi.fn()
const loadPartyVitalsByIds = vi.fn()

vi.mock("@workspace/game-v2/visibility", () => ({
  projectDungeonSnapshot: (...args: unknown[]) =>
    projectDungeonSnapshot(...args),
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
vi.mock("@/lib/db/queries/character-list", () => ({
  loadPlacedCharactersForCampaign: (id: string) =>
    loadPlacedCharactersForCampaign(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadLiveEncounterForMapInstance: (id: string) =>
    loadLiveEncounterForMapInstance(id),
}))
vi.mock("@/lib/db/queries/load-entity", () => ({
  loadLiveEntityRowById: vi.fn(),
}))
vi.mock("@/lib/db/queries/load-party-vitals", () => ({
  loadPartyVitalsByIds: (ids: string[]) => loadPartyVitalsByIds(ids),
}))

const SENTINEL = { fog: "projected" }

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonRowByShortId.mockResolvedValue({
    id: "dungeon-1",
    shortId: "dungeon-a",
    campaignId: "campaign-1",
    mapInstanceId: "mi-1",
    name: "Delve",
    status: "active",
    state: {},
    version: 0,
  })
  loadCampaignRowById.mockResolvedValue({ id: "campaign-1", shortId: "camp-1" })
  loadMapInstanceById.mockResolvedValue({
    id: "mi-1",
    state: { occupancy: {} },
    version: 0,
  })
  loadPlacedCharactersForCampaign.mockResolvedValue([])
  loadLiveEncounterForMapInstance.mockResolvedValue(null)
  loadPartyVitalsByIds.mockResolvedValue(new Map())
  projectDungeonSnapshot.mockReturnValue(SENTINEL)
})

describe("getDungeonSnapshot — campaign pairing (UNN-608)", () => {
  it("404s (null) when the watch URL's campaign does not own the delve", async () => {
    expect(await getDungeonSnapshot("dungeon-a", "wrong-camp")).toBeNull()
    expect(projectDungeonSnapshot).not.toHaveBeenCalled()
  })

  it("projects when the watch URL's campaign matches", async () => {
    expect(await getDungeonSnapshot("dungeon-a", "camp-1")).toBe(SENTINEL)
  })

  it("skips the pairing check for the flat poll API (no campaign passed)", async () => {
    expect(await getDungeonSnapshot("dungeon-a")).toBe(SENTINEL)
  })

  it("404s when no dungeon matches the shortId", async () => {
    loadDungeonRowByShortId.mockResolvedValue(null)
    expect(await getDungeonSnapshot("missing", "camp-1")).toBeNull()
  })
})
