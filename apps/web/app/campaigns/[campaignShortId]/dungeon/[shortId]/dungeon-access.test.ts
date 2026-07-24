import { beforeEach, describe, expect, it, vi } from "vitest"

import { dungeonAxis, entityAxisFor, mapInstanceAxis } from "@/lib/db/axes"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import { getDungeonForDM } from "./dungeon-access"

// Stub the four seams `getDungeonForDM` resolves: the session, the dungeon row,
// its campaign (now resolved by the URL's `campaignShortId`), and its Map Instance.
// The gate logic itself runs for real, so the test asserts the DM-only /
// pairing / no-existence-leak contract end to end. Each case uses a **distinct**
// shortId so React `cache()` memoization never bleeds across tests.
const auth = vi.fn()
const loadDungeonRowByShortId = vi.fn()
const loadCampaignByShortId = vi.fn()
const loadMapInstanceById = vi.fn()
const loadRegionRowById = vi.fn()
const loadPlacedCharactersForCampaign = vi.fn()
const loadLiveEntityRowsByIds = vi.fn()
const { tx, transaction } = vi.hoisted(() => {
  const tx = { kind: "repeatable-read-tx" }
  return {
    tx,
    transaction: vi.fn(
      async (run: (executor: unknown) => unknown, _config: unknown) => run(tx)
    ),
  }
})

vi.mock("@/lib/auth", () => ({
  auth: () => auth(),
}))
vi.mock("@/lib/db/client", () => ({ db: { transaction } }))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowByShortId: (shortId: string, executor: unknown) =>
    loadDungeonRowByShortId(shortId, executor),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignByShortId: (shortId: string, executor: unknown) =>
    loadCampaignByShortId(shortId, executor),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string, executor: unknown) =>
    loadMapInstanceById(id, executor),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  loadRegionRowById: (id: string, executor: unknown) =>
    loadRegionRowById(id, executor),
}))
vi.mock("@/lib/db/queries/character-list", () => ({
  loadPlacedCharactersForCampaign: (id: string, executor: unknown) =>
    loadPlacedCharactersForCampaign(id, executor),
}))
vi.mock("@/lib/db/queries/load-entity", () => ({
  loadLiveEntityRowsByIds: (ids: string[], executor: unknown) =>
    loadLiveEntityRowsByIds(ids, executor),
}))

const DM_ID = "dm-user"

// Fixed timestamps so a factory called twice (once for the mock, once for the
// expected value) yields deep-equal rows — `new Date()` per call differed by ~1ms
// and made the happy-path `toEqual` flaky.
const FIXED_DATE = new Date("2026-06-17T00:00:00.000Z")

const dungeonRow = (shortId: string): DungeonRow =>
  ({
    id: `dungeon-${shortId}`,
    shortId,
    campaignId: "campaign-1",
    mapInstanceId: "mi-1",
    name: "Delve",
    status: "active",
    regionId: null,
    state: {
      turnCounter: 0,
      actedCharacterIds: [],
      reminderSettings: {
        randomEncounters: { enabled: false, intervalTurns: 6 },
      },
      // Inline zero ledger — this tier is engine-gated, so no engine import.
      generation: {
        seed: "",
        streamCursors: {},
        declarations: [],
        mintedUniqueKeys: [],
        mints: {},
      },
    },
    version: 0,
    deletedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  }) satisfies DungeonRow

const campaignRow = (dmUserId: string, id = "campaign-1"): CampaignRow =>
  ({
    id,
    shortId: "camp-1",
    joinToken: "tok",
    dmUserId,
    name: "Campaign",
    description: null,
    lineageGating: false,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  }) satisfies CampaignRow

const instanceRow: MapInstanceRow = {
  id: "mi-1",
  mapId: null,
  state: {
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: {},
      connections: {},
    },
    occupancy: {},
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    generation: {
      zones: {},
      stubs: {},
      connections: {},
      grafts: {},
      startingZoneIds: [],
    },
    lastMovedTokenKey: null,
  },
  version: 0,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
}

const placedCharacter = {
  id: "character-1",
  shortId: "hero-1",
  name: "Hero",
  level: 1,
  portraitUrl: null,
  activeArchetypeKey: null,
  status: "finalized" as const,
  builderStep: 0,
}

const entityVersions = {
  id: placedCharacter.id,
  identityVersion: 1,
  vitalsVersion: 2,
  inventoryVersion: 3,
  progressionVersion: 4,
}

beforeEach(() => {
  auth.mockReset().mockResolvedValue({ user: { id: DM_ID } })
  loadDungeonRowByShortId.mockReset()
  loadCampaignByShortId.mockReset().mockResolvedValue(campaignRow(DM_ID))
  loadMapInstanceById.mockReset().mockResolvedValue(instanceRow)
  loadRegionRowById.mockReset().mockResolvedValue(null)
  loadPlacedCharactersForCampaign
    .mockReset()
    .mockResolvedValue([placedCharacter])
  loadLiveEntityRowsByIds.mockReset().mockResolvedValue([entityVersions])
  transaction.mockClear()
})

describe("getDungeonForDM", () => {
  it("returns the dungeon + its Instance for the campaign DM", async () => {
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("ok-dm"))

    const result = await getDungeonForDM("camp-1", "ok-dm")
    const clientState = {
      turnCounter: 0,
      actedCharacterIds: [],
      reminderSettings: {
        randomEncounters: { enabled: false, intervalTurns: 6 as const },
      },
      generation: {
        declarations: [],
        mintedUniqueKeys: [],
      },
    }

    expect(result).toEqual({
      dungeon: dungeonRow("ok-dm"),
      clientDungeon: {
        id: "dungeon-ok-dm",
        shortId: "ok-dm",
        name: "Delve",
        status: "active",
        regionId: null,
        state: clientState,
      },
      instance: instanceRow,
      placedCharacters: [placedCharacter],
      expandTemplates: [],
      siteTemplates: [],
      canon: {
        value: {
          dungeon: clientState,
          instance: instanceRow.state,
        },
        revisions: {
          [dungeonAxis("dungeon-ok-dm")]: 0,
          [mapInstanceAxis("mi-1")]: 0,
          [entityAxisFor.identity(placedCharacter.id)]: 1,
          [entityAxisFor.vitals(placedCharacter.id)]: 2,
          [entityAxisFor.inventory(placedCharacter.id)]: 3,
          [entityAxisFor.progression(placedCharacter.id)]: 4,
        },
      },
    })
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    })
    expect(loadDungeonRowByShortId).toHaveBeenCalledWith("ok-dm", tx)
    expect(loadPlacedCharactersForCampaign).toHaveBeenCalledWith(
      "campaign-1",
      tx
    )
  })

  it("returns null when signed out (no leak of existence)", async () => {
    auth.mockResolvedValue(null)
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("signed-out"))

    expect(await getDungeonForDM("camp-1", "signed-out")).toBeNull()
  })

  it("returns null when no dungeon matches the shortId", async () => {
    loadDungeonRowByShortId.mockResolvedValue(null)

    expect(await getDungeonForDM("camp-1", "missing")).toBeNull()
  })

  it("returns null for a viewer who is not the campaign DM (non-member/non-DM)", async () => {
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("not-dm"))
    loadCampaignByShortId.mockResolvedValue(campaignRow("someone-else"))

    expect(await getDungeonForDM("camp-1", "not-dm")).toBeNull()
  })

  it("returns null when the URL's campaign does not own the dungeon (pairing check)", async () => {
    // The dungeon belongs to "campaign-1"; the URL names a campaign the DM owns
    // whose id is *different*, so the shortId-globally-unique row must not load.
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("wrong-campaign"))
    loadCampaignByShortId.mockResolvedValue(campaignRow(DM_ID, "campaign-2"))

    expect(await getDungeonForDM("other-camp", "wrong-campaign")).toBeNull()
  })

  it("returns null when the referenced Map Instance is missing (integrity fault)", async () => {
    loadDungeonRowByShortId.mockResolvedValue(dungeonRow("no-instance"))
    loadMapInstanceById.mockResolvedValue(null)

    expect(await getDungeonForDM("camp-1", "no-instance")).toBeNull()
  })
})
