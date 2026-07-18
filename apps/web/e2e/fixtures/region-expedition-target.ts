import { eq } from "drizzle-orm"

import type { StaticReveal } from "@workspace/game-v2/generation"
import {
  reduceMapInstance as createReduceMapInstance,
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
 * Ephemeral target for `e2e/region-expedition.spec.ts` (UNN-589). Mints a
 * finalized PC placed in a dev-DM campaign, an authored three-zone seed Map
 * (Entry — Hall — Vault), an empty Template Set, and a Region binding them.
 * The spec drives the expedition loop through the real surfaces (New
 * expedition → prep → start → finish → again) and asserts the knowledge fold
 * round-trip straight off the DB; these helpers are the poll targets.
 */

const DEV_USER_ID = "dev-user-claude"

const reduceMapInstance = createReduceMapInstance(() => crypto.randomUUID())

export const ENTRY = { id: "zone-entry", name: "Entry" } as const
export const HALL = { id: "zone-hall", name: "Hall" } as const
export const VAULT = { id: "zone-vault", name: "Vault" } as const
/** The DM's hand-added mid-run zone — `manual` provenance, must die with the run. */
export const GHOST = { id: "zone-ghost", name: "Ghost Annex" } as const

export async function createRegionExpeditionTarget(tracker: CleanupTracker) {
  const pc = await createTestCharacter(tracker, { name: "Cartographer D589" })
  const campaign = await createTestCampaign(tracker, {
    dmUserId: DEV_USER_ID,
    name: "Region Campaign",
  })
  await placeCharacter(pc.id, campaign.id)

  const seedMap = await createTestMap(tracker, {
    name: "E2E Drakkenheim",
    geometry: testGeometry({
      zones: [
        { id: ENTRY.id, name: ENTRY.name, x: 0, y: 0 },
        { id: HALL.id, name: HALL.name, x: 200, y: 0 },
        { id: VAULT.id, name: VAULT.name, x: 400, y: 0 },
      ],
      connections: [
        { id: "conn-entry-hall", from: ENTRY.id, to: HALL.id },
        { id: "conn-hall-vault", from: HALL.id, to: VAULT.id },
      ],
    }),
  })
  const templateSet = await createTestTemplateSet(tracker)
  const region = await createTestRegion(tracker, {
    campaignId: campaign.id,
    campaignShortId: campaign.shortId,
    seedMapId: seedMap.id,
    templateSetId: templateSet.id,
    name: "E2E Region",
  })

  /** The Region's persisted `staticReveal` fold (the finish write's target). */
  async function getStaticReveal(): Promise<StaticReveal> {
    const [row] = await getDb()
      .select({ staticReveal: regions.staticReveal })
      .from(regions)
      .where(eq(regions.id, region.id))
      .limit(1)
    if (!row) throw new Error("region-expedition target region missing")
    return row.staticReveal
  }

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

  /** One expedition Instance's persisted state (reveal + geometry poll target). */
  async function getInstanceState(
    mapInstanceId: string
  ): Promise<MapInstanceState> {
    const [row] = await getDb()
      .select({ state: mapInstances.state, version: mapInstances.version })
      .from(mapInstances)
      .where(eq(mapInstances.id, mapInstanceId))
      .limit(1)
    if (!row) throw new Error("region-expedition target instance missing")
    return row.state
  }

  /**
   * Simulates the DM's mid-run session directly against the Instance row —
   * reveal Hall (earned knowledge) and hand-add + reveal the Ghost Annex (a
   * `manual` zone, stamped by the same `reduceMapInstance` the console
   * replays). The UI equivalents are canvas drag/context gestures that are
   * flaky to drive headlessly; what the spec is *testing* — the fold at finish
   * and the re-apply at start — still runs through the real actions.
   */
  async function exploreMidRun(mapInstanceId: string): Promise<void> {
    const db = getDb()
    const [row] = await db
      .select({ state: mapInstances.state, version: mapInstances.version })
      .from(mapInstances)
      .where(eq(mapInstances.id, mapInstanceId))
      .limit(1)
    if (!row) throw new Error("region-expedition target instance missing")

    let state = reduceMapInstance(row.state, {
      kind: "revealZone",
      zoneId: HALL.id,
    })
    state = reduceMapInstance(state, {
      kind: "addZone",
      zoneId: GHOST.id,
      name: GHOST.name,
    })
    state = reduceMapInstance(state, { kind: "revealZone", zoneId: GHOST.id })

    await db
      .update(mapInstances)
      .set({ state, version: row.version + 1 })
      .where(eq(mapInstances.id, mapInstanceId))
  }

  return {
    pc,
    campaign,
    seedMap,
    templateSet,
    region,
    getStaticReveal,
    getExpeditions,
    getInstanceState,
    exploreMidRun,
  }
}
