import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import { getEncounterForDM } from "./load-encounter-for-dm"

// Stub the seams `getEncounterForDM` resolves: the session, the dissolved
// encounter, its campaign (resolved by the URL's `campaignShortId`), and its Map
// Instance. The gate logic runs for real, so the test asserts the DM-only /
// pairing / no-existence-leak contract end to end. The dissolved session carries
// **no durable participants** (empty locators), so `buildParticipantMeta` never
// touches the db. Each case uses a **distinct** shortId so React `cache()`
// memoization never bleeds across tests.
const auth = vi.fn()
const loadEncounterForSnapshot = vi.fn()
const loadCampaignByShortId = vi.fn()
const loadMapInstanceById = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: () => auth(),
}))
vi.mock("@/lib/db/client", () => ({ db: {} }))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForSnapshot: (shortId: string) =>
    loadEncounterForSnapshot(shortId),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignByShortId: (shortId: string) => loadCampaignByShortId(shortId),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))

const DM_ID = "dm-user"
const FIXED_DATE = new Date("2026-06-17T00:00:00.000Z")

/** A dissolved-snapshot `Result` with no durable participants (empty locators, so
 *  the db is never read). Only the row + session shape the loader forwards. */
const loadedOk = (shortId: string) => ({
  ok: true as const,
  value: {
    row: {
      id: `enc-${shortId}`,
      shortId,
      campaignId: "campaign-1",
      mapInstanceId: "mi-1",
      name: "Ambush",
      notes: null,
      status: "live" as const,
      version: 0,
    },
    loaded: { session: { participants: [] }, locators: new Map() },
    durableVersions: new Map(),
    durableOwners: new Map(),
  },
})

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
    generation: { zones: {}, grafts: {} },
    lastMovedTokenKey: null,
  },
  version: 0,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
}

beforeEach(() => {
  auth.mockReset().mockResolvedValue({ user: { id: DM_ID } })
  loadEncounterForSnapshot.mockReset()
  loadCampaignByShortId.mockReset().mockResolvedValue(campaignRow(DM_ID))
  loadMapInstanceById.mockReset().mockResolvedValue(instanceRow)
})

describe("getEncounterForDM", () => {
  it("returns the encounter + its Instance for the campaign DM", async () => {
    loadEncounterForSnapshot.mockResolvedValue(loadedOk("ok-dm"))

    const result = await getEncounterForDM("camp-1", "ok-dm")

    expect(result?.encounter.shortId).toBe("ok-dm")
    expect(result?.instance).toEqual({ state: instanceRow.state, version: 0 })
  })

  it("returns null when signed out (no leak of existence)", async () => {
    auth.mockResolvedValue(null)
    loadEncounterForSnapshot.mockResolvedValue(loadedOk("signed-out"))

    expect(await getEncounterForDM("camp-1", "signed-out")).toBeNull()
  })

  it("returns null when the encounter row can't be dissolved", async () => {
    loadEncounterForSnapshot.mockResolvedValue({
      ok: false,
      error: "encounter-not-found",
    })

    expect(await getEncounterForDM("camp-1", "missing")).toBeNull()
  })

  it("returns null for a viewer who is not the campaign DM", async () => {
    loadEncounterForSnapshot.mockResolvedValue(loadedOk("not-dm"))
    loadCampaignByShortId.mockResolvedValue(campaignRow("someone-else"))

    expect(await getEncounterForDM("camp-1", "not-dm")).toBeNull()
  })

  it("returns null when the URL's campaign does not own the encounter (pairing check)", async () => {
    // The encounter belongs to "campaign-1"; the URL names a campaign the DM owns
    // whose id is *different*, so the shortId-globally-unique row must not load.
    loadEncounterForSnapshot.mockResolvedValue(loadedOk("wrong-campaign"))
    loadCampaignByShortId.mockResolvedValue(campaignRow(DM_ID, "campaign-2"))

    expect(await getEncounterForDM("other-camp", "wrong-campaign")).toBeNull()
  })

  it("returns null when the referenced Map Instance is missing (integrity fault)", async () => {
    loadEncounterForSnapshot.mockResolvedValue(loadedOk("no-instance"))
    loadMapInstanceById.mockResolvedValue(null)

    expect(await getEncounterForDM("camp-1", "no-instance")).toBeNull()
  })
})
