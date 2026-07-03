import { and, eq } from "drizzle-orm"

import { createMapInstance } from "@workspace/game/engine"
import { type MapInstanceState } from "@workspace/game/foundation"

import { dungeons, encounters, getDb, mapInstances } from "@/lib/db"
import { reduceMapInstance } from "@/lib/game-engine"

import {
  createActiveDungeon,
  createTestCampaign,
  createTestCharacter,
  placeCharacter,
  type CleanupTracker,
} from "./factory"

/**
 * Ephemeral target for `e2e/dungeon-combat.spec.ts` (UNN-536). Mints a finalized
 * PC, a dev-DM campaign the PC is placed in, and an **active** dungeon whose Map
 * Instance carries two adjacent zones (Entry ↔ Hall) with the PC standing in Entry
 * — the delve exploration baseline the combat cutover starts a fight over. The DM
 * drives Start → turn loop → End; the spec asserts the persisted round-trip (a live
 * encounter appears, then the turn advances, the enemy token is pruned, and the PC
 * token stays in place) straight off the DB. Per-run + torn down in `afterAll`.
 */

const DEV_USER_ID = "dev-user-claude"

/** The PC's combat participant id === its `characterId` (the delve token doubles
 *  as the combat token), so the spec reads it off occupancy by the character id. */
const ENTRY = { id: "zone-entry", name: "Entry" } as const
const HALL = { id: "zone-hall", name: "Hall" } as const

function buildInstanceState(characterId: string): MapInstanceState {
  const base = createMapInstance(() => characterId)([])
  let state = reduceMapInstance(base, {
    kind: "addZone",
    name: ENTRY.name,
    zoneId: ENTRY.id,
  })
  state = reduceMapInstance(state, {
    kind: "addZone",
    name: HALL.name,
    zoneId: HALL.id,
  })
  state = reduceMapInstance(state, {
    kind: "setZoneAdjacency",
    zoneIdA: ENTRY.id,
    zoneIdB: HALL.id,
    adjacent: true,
  })
  return {
    ...state,
    occupancy: {
      ...state.occupancy,
      [characterId]: { zoneId: ENTRY.id, engagement: { status: "free" } },
    },
  }
}

export async function createDungeonCombatTarget(tracker: CleanupTracker) {
  const pc = await createTestCharacter(tracker, { name: "Delver D536" })
  const campaign = await createTestCampaign(tracker, {
    dmUserId: DEV_USER_ID,
    name: "Delve Campaign",
  })
  await placeCharacter(pc.id, campaign.id)

  const dungeon = await createActiveDungeon(tracker, {
    campaignId: campaign.id,
    mapInstanceState: buildInstanceState(pc.id),
    name: "E2E Sunken Vault",
  })

  /** The single **live** encounter running on this delve's Instance, or null —
   *  the DB read behind the page's combat-vs-explore fork. */
  async function getLiveEncounter(): Promise<{ id: string } | null> {
    const [row] = await getDb()
      .select({ id: encounters.id })
      .from(encounters)
      .where(
        and(
          eq(encounters.mapInstanceId, dungeon.mapInstanceId),
          eq(encounters.status, "live")
        )
      )
      .limit(1)
    return row ?? null
  }

  /** The count of encounters (any status) on this delve's Instance — a fight that
   *  ended leaves an `ended` row, so this stays ≥ 1 once combat has run. */
  async function getEncounterCount(): Promise<number> {
    const rows = await getDb()
      .select({ id: encounters.id })
      .from(encounters)
      .where(eq(encounters.mapInstanceId, dungeon.mapInstanceId))
    return rows.length
  }

  /** The delve's dungeon-turn counter (advances by one at combat end). */
  async function getDungeonTurn(): Promise<number> {
    const [row] = await getDb()
      .select({ state: dungeons.state })
      .from(dungeons)
      .where(eq(dungeons.id, dungeon.id))
      .limit(1)
    if (!row) throw new Error("dungeon-combat target dungeon missing")
    return row.state.turnCounter
  }

  /** The Instance occupancy: the token keys currently standing on the delve map. */
  async function getOccupancyKeys(): Promise<string[]> {
    const [row] = await getDb()
      .select({ state: mapInstances.state })
      .from(mapInstances)
      .where(eq(mapInstances.id, dungeon.mapInstanceId))
      .limit(1)
    if (!row) throw new Error("dungeon-combat target instance missing")
    return Object.keys(row.state.occupancy)
  }

  return {
    pc,
    campaign,
    dungeon,
    startZone: ENTRY,
    getLiveEncounter,
    getEncounterCount,
    getDungeonTurn,
    getOccupancyKeys,
  }
}
