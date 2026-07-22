import { beforeEach, describe, expect, it, vi } from "vitest"

import { revisionAt } from "@workspace/headcanon"

import { dungeonAxis, entityAxisFor, mapInstanceAxis } from "@/lib/db/axes"

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
const loadLiveEntityRowsByIds = vi.fn()

vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: (run: (tx: object) => unknown) => run({}),
  },
}))

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
  loadLiveEntityRowsByIds: (ids: string[]) => loadLiveEntityRowsByIds(ids),
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
    state: {
      occupancy: {},
      geometry: { zones: {}, connections: {} },
      reveal: {
        revealedZoneIds: [],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
      // The real loader zod-parses the blob, so `generation` always exists —
      // the fixture mirrors the load-schema fixed point (UNN-590).
      generation: { zones: {}, stubs: {}, connections: {}, grafts: {} },
    },
    version: 0,
  })
  loadPlacedCharactersForCampaign.mockResolvedValue([])
  loadLiveEncounterForMapInstance.mockResolvedValue(null)
  loadPartyVitalsByIds.mockResolvedValue(new Map())
  loadLiveEntityRowsByIds.mockResolvedValue([])
  projectDungeonSnapshot.mockReturnValue(SENTINEL)
})

describe("getDungeonSnapshot — campaign pairing (UNN-608)", () => {
  it("404s (null) when the watch URL's campaign does not own the delve", async () => {
    expect(await getDungeonSnapshot("dungeon-a", "wrong-camp")).toBeNull()
    expect(projectDungeonSnapshot).not.toHaveBeenCalled()
  })

  it("projects when the watch URL's campaign matches", async () => {
    expect((await getDungeonSnapshot("dungeon-a", "camp-1"))?.value).toBe(
      SENTINEL
    )
  })

  it("skips the pairing check for the flat poll API (no campaign passed)", async () => {
    expect((await getDungeonSnapshot("dungeon-a"))?.value).toBe(SENTINEL)
  })

  it("404s when no dungeon matches the shortId", async () => {
    loadDungeonRowByShortId.mockResolvedValue(null)
    expect(await getDungeonSnapshot("missing", "camp-1")).toBeNull()
  })
})

describe("getDungeonSnapshot — stub anchors thread to the projector (UNN-590)", () => {
  it("passes a revealed parent's stub anchor (keyed by stub id) as an exit anchor", async () => {
    loadMapInstanceById.mockResolvedValue({
      id: "mi-1",
      state: {
        occupancy: {},
        geometry: {
          pages: { default: { id: "default", name: "Page 1" } },
          zones: {
            z1: {
              id: "z1",
              name: "Entry",
              description: "",
              dmNotes: "",
              position: { x: 0, y: 0 },
              pageId: "default",
            },
          },
          connections: {},
        },
        reveal: {
          revealedZoneIds: ["z1"],
          revealedConnectionIds: [],
          unlockedConnectionIds: [],
        },
        generation: {
          zones: {},
          stubs: {
            "stub-1": {
              id: "stub-1",
              zoneId: "z1",
              bearing: 1.1,
              anchor: { side: "w", offset: 0.3 },
            },
          },
          connections: {},
          grafts: {},
        },
      },
      version: 0,
    })

    const canon = await getDungeonSnapshot("dungeon-a")
    expect(canon?.value).toBe(SENTINEL)

    const exitAnchors = projectDungeonSnapshot.mock.calls[0]!.at(-1) as Record<
      string,
      { side: string; offset: number }
    >
    expect(exitAnchors["stub-1"]).toEqual({ side: "w", offset: 0.3 })
  })
})

describe("getDungeonSnapshot — observed dependencies", () => {
  it("observes stable container axes even when no encounter or roster member exists", async () => {
    const canon = await getDungeonSnapshot("dungeon-a")
    expect(canon).not.toBeNull()
    expect(revisionAt(canon!.revisions, dungeonAxis("dungeon-1"))).toBe(0)
    expect(revisionAt(canon!.revisions, mapInstanceAxis("mi-1"))).toBe(0)
  })

  it("observes every axis for projected roster members", async () => {
    loadPlacedCharactersForCampaign.mockResolvedValue([
      { id: "char-1", name: "Iris", portraitUrl: null },
    ])
    loadLiveEntityRowsByIds.mockResolvedValue([
      {
        id: "char-1",
        identityVersion: 1,
        vitalsVersion: 2,
        inventoryVersion: 3,
        progressionVersion: 4,
      },
    ])

    const canon = await getDungeonSnapshot("dungeon-a")
    expect(revisionAt(canon!.revisions, entityAxisFor.identity("char-1"))).toBe(
      1
    )
    expect(revisionAt(canon!.revisions, entityAxisFor.vitals("char-1"))).toBe(2)
    expect(
      revisionAt(canon!.revisions, entityAxisFor.inventory("char-1"))
    ).toBe(3)
    expect(
      revisionAt(canon!.revisions, entityAxisFor.progression("char-1"))
    ).toBe(4)
  })
})
