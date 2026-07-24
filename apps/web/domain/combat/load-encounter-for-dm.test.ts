import { beforeEach, describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import {
  dungeonAxis,
  encounterAxis,
  entityAxisFor,
  mapInstanceAxis,
} from "@/lib/db/axes"
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
const loadCombatConsoleData = vi.fn()
const loadDungeonRowById = vi.fn()
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
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForSnapshot: (shortId: string, executor: unknown) =>
    loadEncounterForSnapshot(shortId, executor),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string, executor: unknown) =>
    loadDungeonRowById(id, executor),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignByShortId: (shortId: string, executor: unknown) =>
    loadCampaignByShortId(shortId, executor),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string, executor: unknown) =>
    loadMapInstanceById(id, executor),
}))
vi.mock("@/lib/db/queries/load-combat-console-data", () => ({
  loadCombatConsoleData: (...args: unknown[]) => loadCombatConsoleData(...args),
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
    durableRevisions: new Map(),
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

beforeEach(() => {
  auth.mockReset().mockResolvedValue({ user: { id: DM_ID } })
  loadEncounterForSnapshot.mockReset()
  loadCampaignByShortId.mockReset().mockResolvedValue(campaignRow(DM_ID))
  loadMapInstanceById.mockReset().mockResolvedValue(instanceRow)
  loadCombatConsoleData.mockReset().mockResolvedValue({})
  loadDungeonRowById.mockReset()
  transaction.mockClear()
})

describe("getEncounterForDM", () => {
  it("returns the encounter + its Instance for the campaign DM", async () => {
    loadEncounterForSnapshot.mockResolvedValue(loadedOk("ok-dm"))

    const result = await getEncounterForDM("camp-1", "ok-dm")

    expect(result?.encounter.shortId).toBe("ok-dm")
    expect(result?.canon.value.mapInstance).toEqual(instanceRow.state)
    expect(result?.encounter).not.toHaveProperty("version")
    expect(result).not.toHaveProperty("instanceVersion")
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    })
    expect(loadEncounterForSnapshot).toHaveBeenCalledWith("ok-dm", tx)
    expect(loadCampaignByShortId).toHaveBeenCalledWith("camp-1", tx)
    expect(loadMapInstanceById).toHaveBeenCalledWith("mi-1", tx)
    expect(loadCombatConsoleData).toHaveBeenCalledWith(
      expect.anything(),
      instanceRow.state,
      {},
      tx
    )
  })

  it("includes all durable entity axes and rebuilds them from the current roster", async () => {
    const participantId = asParticipantId("participant-durable")
    const loaded = loadedOk("durable-roster")
    loaded.value.loaded.locators.set(participantId, {
      storage: "durable",
      entityId: "raw-entity-id",
    })
    loaded.value.durableRevisions.set("raw-entity-id", {
      identity: 1,
      vitals: 2,
      inventory: 3,
      progression: 4,
    })
    loadEncounterForSnapshot.mockResolvedValue(loaded)

    const result = await getEncounterForDM("camp-1", "durable-roster")

    expect(result?.canon.revisions).toEqual({
      [encounterAxis("enc-durable-roster")]: 0,
      [mapInstanceAxis("mi-1")]: 0,
      [entityAxisFor.identity("raw-entity-id")]: 1,
      [entityAxisFor.vitals("raw-entity-id")]: 2,
      [entityAxisFor.inventory("raw-entity-id")]: 3,
      [entityAxisFor.progression("raw-entity-id")]: 4,
    })
    expect(JSON.stringify(result?.canon.revisions)).not.toContain(
      "raw-entity-id"
    )
  })

  it("includes the owning dungeon axis in the same combat snapshot", async () => {
    loadEncounterForSnapshot.mockResolvedValue(loadedOk("dungeon-combat"))
    loadDungeonRowById.mockResolvedValue({
      id: "dungeon-1",
      mapInstanceId: "mi-1",
      version: 6,
    })

    const result = await getEncounterForDM(
      "camp-1",
      "dungeon-combat",
      "dungeon-1"
    )

    expect(result?.canon.revisions).toMatchObject({
      [encounterAxis("enc-dungeon-combat")]: 0,
      [mapInstanceAxis("mi-1")]: 0,
      [dungeonAxis("dungeon-1")]: 6,
    })
    expect(loadDungeonRowById).toHaveBeenCalledWith("dungeon-1", tx)
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
