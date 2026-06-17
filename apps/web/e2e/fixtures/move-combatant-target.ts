import { eq } from "drizzle-orm"

import { createCombatSession, createMapInstance } from "@workspace/game/engine"
import {
  type CombatSession,
  type MapInstanceState,
} from "@workspace/game/foundation"

import { encounters, getDb, mapInstances } from "@/lib/db"
import { reduceCombatSession, reduceMapInstance } from "@/lib/game-engine"

import {
  createLiveEncounter,
  createTestCampaign,
  createTestCharacter,
  type CleanupTracker,
} from "./factory"

/**
 * Ephemeral target for `e2e/move-combatant.spec.ts` (UNN-472, the M0 safety
 * net). Mints a finalized PC, a dev-DM campaign, and a **live** encounter whose
 * **Map Instance** carries two adjacent zones (Courtyard ↔ Hall) with the PC
 * placed in Courtyard — the minimum to drive the drawer's `moveCombatant`
 * control and read the persisted `zoneId` back. After the M0 cutover (UNN-459)
 * the spatial state lives on the Instance, so the session is just the started
 * combat (built through the app-bound `reduceCombatSession`) and the zones /
 * occupancy are built through `reduceMapInstance` over a `MapInstanceState`;
 * both are persisted verbatim via the factory overrides. Per-run + torn down in
 * `afterAll`, so nothing it edits can race a parallel worker.
 */

const DEV_USER_ID = "dev-user-claude"

/** Stable so the spec can read the moved combatant straight off the Instance. */
const PC_COMBATANT_ID = "mc-pc"

const COURTYARD = { id: "zone-a", name: "Courtyard" } as const
const HALL = { id: "zone-b", name: "Hall" } as const

/** The session baseline: a single placed PC in a started (neutral, players-first)
 *  live session. Position lives on the Instance now, not the combatant. */
function buildSession(characterId: string): CombatSession {
  const base = createCombatSession(() => PC_COMBATANT_ID)([
    {
      id: PC_COMBATANT_ID,
      side: "players",
      ref: { kind: "pc", characterId },
      zoneId: COURTYARD.id,
    },
  ])
  return reduceCombatSession(base, {
    kind: "startCombat",
    advantage: "neutral",
    firstSide: "players",
  })
}

/** The Instance baseline: the PC stands in Courtyard, adjacent to Hall. The PC
 *  is placed via its setup `zoneId` (not a `moveCombatant`), so the baseline is
 *  independent of the move reducer the spec exercises — the only move under test
 *  is the UI travel. */
function buildInstanceState(characterId: string): MapInstanceState {
  const base = createMapInstance(() => PC_COMBATANT_ID)([
    {
      id: PC_COMBATANT_ID,
      side: "players",
      ref: { kind: "pc", characterId },
      zoneId: COURTYARD.id,
    },
  ])

  let state = reduceMapInstance(base, {
    kind: "addZone",
    name: COURTYARD.name,
    zoneId: COURTYARD.id,
  })
  state = reduceMapInstance(state, {
    kind: "addZone",
    name: HALL.name,
    zoneId: HALL.id,
  })
  return reduceMapInstance(state, {
    kind: "setZoneAdjacency",
    zoneIdA: COURTYARD.id,
    zoneIdB: HALL.id,
    adjacent: true,
  })
}

export async function createMoveCombatantTarget(tracker: CleanupTracker) {
  const pc = await createTestCharacter(tracker, { name: "Mira T911" })
  const campaign = await createTestCampaign(tracker, {
    dmUserId: DEV_USER_ID,
    name: "Move Campaign",
  })
  const encounter = await createLiveEncounter(tracker, {
    campaignId: campaign.id,
    status: "live",
    session: buildSession(pc.id),
    mapInstanceState: buildInstanceState(pc.id),
  })

  /** Restores the encounter + Instance to the canonical baseline (PC back in
   *  Courtyard, versions reset) so the move test is repeatable. */
  async function reset(): Promise<void> {
    const db = getDb()
    await db
      .update(mapInstances)
      .set({ state: buildInstanceState(pc.id), version: 0 })
      .where(eq(mapInstances.id, encounter.mapInstanceId))
    await db
      .update(encounters)
      .set({ session: buildSession(pc.id), version: 0 })
      .where(eq(encounters.id, encounter.id))
  }

  /** Reads the PC combatant's persisted `zoneId` off the Instance occupancy. */
  async function getCombatantZone(): Promise<string | undefined> {
    const [row] = await getDb()
      .select({ state: mapInstances.state })
      .from(mapInstances)
      .where(eq(mapInstances.id, encounter.mapInstanceId))
      .limit(1)
    if (!row) throw new Error("move-combatant target instance missing")
    return row.state.occupancy[PC_COMBATANT_ID]?.zoneId
  }

  return {
    pc,
    campaign,
    encounter,
    startZone: COURTYARD,
    destinationZone: HALL,
    reset,
    getCombatantZone,
  }
}
