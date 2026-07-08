import { eq } from "drizzle-orm"

import {
  defaultOverlay,
  storedSessionSchema,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  reduceMapInstance as createReduceMapInstance,
  emptyMapInstance,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"

import { encounters, getDb, mapInstances } from "@/lib/db"

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
 * control and read the persisted `zoneId` back. The session is a v2
 * {@link StoredSession} (UNN-535): one started durable participant; the
 * zones / occupancy are built through `reduceMapInstance` over a
 * `MapInstanceState` (the blob shape is era-agnostic); both persist verbatim
 * via the factory overrides. Per-run + torn down in `afterAll`, so nothing it
 * edits can race a parallel worker.
 */

const DEV_USER_ID = "dev-user-claude"

/** Stable so the spec can read the moved combatant straight off the Instance. */
const PC_COMBATANT_ID = "mc-pc"

const reduceMapInstance = createReduceMapInstance(() => crypto.randomUUID())

const COURTYARD = { id: "zone-a", name: "Courtyard" } as const
const HALL = { id: "zone-b", name: "Hall" } as const

/** The session baseline: a single durable PC in a started (neutral,
 *  players-first) live session. Position lives on the Instance, not here. */
function buildSession(characterId: string): StoredSession {
  return storedSessionSchema.parse({
    round: 1,
    currentActorId: null,
    advantage: "neutral",
    firstSide: "players",
    participants: [
      {
        id: asParticipantId(PC_COMBATANT_ID),
        locator: { storage: "durable", entityId: characterId },
        overlay: defaultOverlay({ side: "players" }),
      },
    ],
  } satisfies StoredSession)
}

/** The Instance baseline: the PC stands in Courtyard, adjacent to Hall. The PC
 *  token is laid down directly in occupancy (the setup-time placement), so the
 *  baseline is independent of the move reducer the spec exercises — the only
 *  move under test is the UI travel. */
function buildInstanceState(): MapInstanceState {
  const base = emptyMapInstance()

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
  state = reduceMapInstance(state, {
    kind: "setZoneAdjacency",
    zoneIdA: COURTYARD.id,
    zoneIdB: HALL.id,
    adjacent: true,
  })
  return {
    ...state,
    occupancy: {
      ...state.occupancy,
      [PC_COMBATANT_ID]: {
        zoneId: COURTYARD.id,
        engagement: { status: "free" },
      },
    },
  }
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
    mapInstanceState: buildInstanceState(),
  })

  /** Restores the encounter + Instance to the canonical baseline (PC back in
   *  Courtyard, versions reset) so the move test is repeatable. */
  async function reset(): Promise<void> {
    const db = getDb()
    await db
      .update(mapInstances)
      .set({ state: buildInstanceState(), version: 0 })
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
