import { eq } from "drizzle-orm"

import { createCombatSession } from "@workspace/game/engine"
import { type CombatSession } from "@workspace/game/foundation"

import { encounters, getDb } from "@/lib/db"
import { reduceCombatSession } from "@/lib/game-engine"

import {
  createLiveEncounter,
  createTestCampaign,
  createTestCharacter,
  type CleanupTracker,
} from "./factory"

/**
 * Ephemeral target for `e2e/move-combatant.spec.ts` (UNN-472, the M0 safety
 * net). Mints a finalized PC, a dev-DM campaign, and a **live** encounter whose
 * session carries two adjacent zones (Courtyard ↔ Hall) with the PC placed in
 * Courtyard — the minimum to drive the drawer's `moveCombatant` control and read
 * the persisted `zoneId` back. Built the same way the showcase encounters are
 * (compose reducer events through the app-bound `reduceCombatSession`), then
 * persisted verbatim via the factory's `session` override. Per-run + torn down in
 * `afterAll`, so nothing it edits can race a parallel worker.
 */

const DEV_USER_ID = "dev-user-claude"

/** Stable so the spec can read the moved combatant straight off the session. */
const PC_COMBATANT_ID = "mc-pc"

const COURTYARD = { id: "zone-a", name: "Courtyard" } as const
const HALL = { id: "zone-b", name: "Hall" } as const

/** The canonical baseline: the PC stands in Courtyard, adjacent to Hall, in a
 *  started (neutral, players-first) live session. The PC is placed via its setup
 *  `zoneId` (not a `moveCombatant`), so the baseline is independent of the move
 *  reducer the spec exercises — the only move under test is the UI travel. */
function buildSession(characterId: string): CombatSession {
  const base = createCombatSession(() => PC_COMBATANT_ID)([
    {
      id: PC_COMBATANT_ID,
      side: "players",
      ref: { kind: "pc", characterId },
      zoneId: COURTYARD.id,
    },
  ])

  let session = reduceCombatSession(base, {
    kind: "addZone",
    name: COURTYARD.name,
    zoneId: COURTYARD.id,
  })
  session = reduceCombatSession(session, {
    kind: "addZone",
    name: HALL.name,
    zoneId: HALL.id,
  })
  session = reduceCombatSession(session, {
    kind: "setZoneAdjacency",
    zoneIdA: COURTYARD.id,
    zoneIdB: HALL.id,
    adjacent: true,
  })
  return reduceCombatSession(session, {
    kind: "startCombat",
    advantage: "neutral",
    firstSide: "players",
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
  })

  /** Restores the encounter to the canonical baseline (PC back in Courtyard,
   *  version reset) so the move test is repeatable. */
  async function reset(): Promise<void> {
    await getDb()
      .update(encounters)
      .set({ session: buildSession(pc.id), version: 0 })
      .where(eq(encounters.id, encounter.id))
  }

  /** Reads the PC combatant's persisted `zoneId` off the encounter session. */
  async function getCombatantZone(): Promise<string | undefined> {
    const [row] = await getDb()
      .select({ session: encounters.session })
      .from(encounters)
      .where(eq(encounters.id, encounter.id))
      .limit(1)
    if (!row) throw new Error("move-combatant target encounter missing")
    return row.session.combatants.find((c) => c.id === PC_COMBATANT_ID)?.zoneId
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
