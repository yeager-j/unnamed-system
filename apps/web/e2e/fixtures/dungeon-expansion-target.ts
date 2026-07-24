import { eq } from "drizzle-orm"

import { templateSetContentSchema } from "@workspace/game-v2/generation"
import {
  reduceMapInstance as createReduceMapInstance,
  type DungeonState,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"

import { dungeons, getDb, mapInstances, regions } from "@/lib/db"

import {
  createTestCampaign,
  createTestCharacter,
  createTestMap,
  createTestRegion,
  createTestTemplateSet,
  placeCharacter,
  testGeometry,
  type CleanupTracker,
} from "./factory"

/**
 * Ephemeral target for `e2e/dungeon-pregeneration.spec.ts` (UNN-642). Mints a
 * finalized PC in a dev-DM campaign, a one-zone seed Map whose Entry is bound
 * to the set's "hall" template (so expedition start has a frontier to carve),
 * and a Template Set with one weighted template and `closureChance: 0`, so
 * pre-generation grows a deterministic "Hall Chamber" board. The weight-0
 * "Ossuary" never rolls. The spec starts an expedition and polls these helpers
 * to assert the whole map is pre-generated at turn 0.
 */

const DEV_USER_ID = "dev-user-claude"
const reduceMapInstance = createReduceMapInstance(() => crypto.randomUUID())

export const ENTRY = { id: "zone-entry", name: "Entry" } as const
export const MONOLITH = { id: "zone-monolith", name: "Black Monolith" } as const
export const HALL_TEMPLATE = { key: "hall", name: "Hall Chamber" } as const
export const OSSUARY_TEMPLATE = { key: "ossuary", name: "Ossuary" } as const
export const CRYPT_TEMPLATE = { key: "crypt", name: "Sunken Crypt" } as const
export const MONOLITH_TEMPLATE = {
  key: "monolith",
  name: MONOLITH.name,
} as const

const EXPANSION_SET_CONTENT = templateSetContentSchema.parse({
  templates: {
    [HALL_TEMPLATE.key]: {
      key: HALL_TEMPLATE.key,
      name: HALL_TEMPLATE.name,
      tags: ["hub"],
      accepts: ["hub"],
      weight: 1,
      // Two non-optional exits: Entry sprouts two stubs at start (no authored
      // connections to debit); a minted Hall keeps one onward child stub (the
      // incoming connection debits the other) — a leaf with an open child,
      // exactly the retract-legal shape.
      exits: [{ optional: false }, { optional: false }],
    },
    [OSSUARY_TEMPLATE.key]: {
      key: OSSUARY_TEMPLATE.key,
      name: OSSUARY_TEMPLATE.name,
      tags: ["hub"],
      accepts: ["hub"],
      // Never random — the site-by-choice profile; only force-pick mints it.
      weight: 0,
      unique: true,
      site: {
        appearByDefault: true,
        defaultMinDepth: 2,
        defaultUrgency: "session",
      },
    },
    [CRYPT_TEMPLATE.key]: {
      key: CRYPT_TEMPLATE.key,
      name: CRYPT_TEMPLATE.name,
      tags: ["hub"],
      accepts: ["hub"],
      weight: 0,
      unique: true,
      site: {
        appearByDefault: false,
        defaultMinDepth: 3,
        defaultUrgency: "eventually",
      },
    },
    [MONOLITH_TEMPLATE.key]: {
      key: MONOLITH_TEMPLATE.key,
      name: MONOLITH_TEMPLATE.name,
      tags: ["hub"],
      accepts: ["hub"],
      weight: 0,
      unique: true,
    },
  },
  closureChance: 0,
})

export async function createDungeonExpansionTarget(tracker: CleanupTracker) {
  const pc = await createTestCharacter(tracker, { name: "Delver D642" })
  const campaign = await createTestCampaign(tracker, {
    dmUserId: DEV_USER_ID,
    name: "Expansion Campaign",
  })
  await placeCharacter(pc.id, campaign.id)

  const seedMap = await createTestMap(tracker, {
    name: "E2E Expansion Seed",
    geometry: testGeometry({
      zones: [
        {
          id: ENTRY.id,
          name: ENTRY.name,
          x: 0,
          y: 0,
          templateKey: HALL_TEMPLATE.key,
        },
        {
          id: MONOLITH.id,
          name: MONOLITH.name,
          x: -2000,
          y: 0,
          templateKey: MONOLITH_TEMPLATE.key,
        },
      ],
    }),
  })
  const templateSet = await createTestTemplateSet(tracker, {
    content: EXPANSION_SET_CONTENT,
  })
  const region = await createTestRegion(tracker, {
    campaignId: campaign.id,
    campaignShortId: campaign.shortId,
    seedMapId: seedMap.id,
    templateSetId: templateSet.id,
    name: "E2E Expansion Region",
  })

  /** Every expedition row of the Region, newest first. */
  async function getExpeditions(): Promise<
    Array<{
      id: string
      shortId: string
      status: string
      mapInstanceId: string
    }>
  > {
    const rows = await getDb()
      .select({
        id: dungeons.id,
        shortId: dungeons.shortId,
        status: dungeons.status,
        mapInstanceId: dungeons.mapInstanceId,
        createdAt: dungeons.createdAt,
      })
      .from(dungeons)
      .where(eq(dungeons.regionId, region.id))
    return rows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ createdAt: _createdAt, ...row }) => row)
  }

  /** The expedition Instance's persisted state (geometry/stubs poll target). */
  async function getInstanceState(
    mapInstanceId: string
  ): Promise<MapInstanceState> {
    const [row] = await getDb()
      .select({ state: mapInstances.state })
      .from(mapInstances)
      .where(eq(mapInstances.id, mapInstanceId))
      .limit(1)
    if (!row) throw new Error("dungeon-expansion target instance missing")
    return row.state
  }

  /** The expedition's dungeon state (ledger/turn poll target). */
  async function getDungeonState(dungeonId: string): Promise<DungeonState> {
    const [row] = await getDb()
      .select({ state: dungeons.state })
      .from(dungeons)
      .where(eq(dungeons.id, dungeonId))
      .limit(1)
    if (!row) throw new Error("dungeon-expansion target dungeon missing")
    return row.state
  }

  async function revealZones(
    mapInstanceId: string,
    zoneIds: readonly string[]
  ): Promise<void> {
    const db = getDb()
    const [row] = await db
      .select({
        state: mapInstances.state,
        version: mapInstances.version,
      })
      .from(mapInstances)
      .where(eq(mapInstances.id, mapInstanceId))
      .limit(1)
    if (!row) throw new Error("dungeon-expansion target instance missing")

    const state = zoneIds.reduce(
      (current, zoneId) =>
        reduceMapInstance(current, { kind: "revealZone", zoneId }),
      row.state
    )
    await db
      .update(mapInstances)
      .set({ state, version: row.version + 1 })
      .where(eq(mapInstances.id, mapInstanceId))
  }

  async function getDiscoveredSiteKeys(): Promise<string[]> {
    const [row] = await getDb()
      .select({ discoveredSiteKeys: regions.discoveredSiteKeys })
      .from(regions)
      .where(eq(regions.id, region.id))
      .limit(1)
    if (!row) throw new Error("dungeon-expansion target Region missing")
    return row.discoveredSiteKeys
  }

  return {
    pc,
    campaign,
    seedMap,
    templateSet,
    region,
    getExpeditions,
    getInstanceState,
    getDungeonState,
    revealZones,
    getDiscoveredSiteKeys,
  }
}
