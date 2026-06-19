"use server"

import {
  addOccupant,
  isRosterFullyPlaced,
  removeOccupant,
  toCombatantSetup,
} from "@workspace/game/engine"
import {
  err,
  isMapInstanceEvent,
  ok,
  type CombatEvent,
  type MapInstanceEvent,
  type Result,
} from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db, type WriteExecutor } from "@/lib/db/client"
import {
  loadEncounterCampaignId,
  loadEncounterRowById,
  loadLiveEncounterForCampaign,
} from "@/lib/db/queries/load-encounter"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import {
  saveEncounterSession,
  setEncounterStatus,
} from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import { reduceCombatSession, reduceMapInstance } from "@/lib/game-engine"
import {
  publishEncounterInstancePing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import {
  ApplyCombatEventSchema,
  type ApplyCombatEventError,
  type ApplyCombatEventInput,
} from "./events.schema"
import { revalidateEncounter } from "./revalidate"

/**
 * The impure shell that drives the pure tracker engine (ADR Decision 4): it
 * applies one event to an encounter and saves the result, version-guarded. After
 * the M0 cutover (UNN-459) the spatial state lives on the Map Instance, so the
 * wire event is a union of {@link CombatEvent} (session) and
 * {@link MapInstanceEvent} (spatial); this action **routes on**
 * {@link isMapInstanceEvent} to the right reducer + row. The DM client mirrors
 * the *same* event through the *same* reducer via two `useOptimistic` containers,
 * so the wire payload is always the event — never a client-computed state.
 *
 * Flow: parse the wire payload → authorize the caller against the owning
 * campaign **before** any state is loaded (`requireCampaignDM` trips
 * `forbidden()` for a non-DM) → branch:
 *
 * - **Pure spatial event** (zone-graph / move / engagement / enchantment) → load
 *   the Instance, `reduceMapInstance`, single-row `saveMapInstanceState` guarded
 *   on `expectedInstanceVersion`. **No realtime ping** (poll-only for M0 — see
 *   `writes/map-instance.ts`).
 * - **`addCombatant` / `removeCombatant`** (session events that now CROSS-WRITE
 *   the Instance token) → one `guardMany` transaction: the session reduce **and**
 *   `addOccupant` / `removeOccupant` on the Instance, guarded on both versions.
 * - **`startCombat`** → roster check reads the Instance occupancy/zones; the
 *   session save + `draft → live` status flip fold into one `guardMany` (retiring
 *   the old stuck-`draft` recovery dance — both writes now commit atomically).
 * - **Other session events** → the unchanged single-row `saveEncounterSession`.
 *
 * The reducer never writes a character row; PC vitals move through their own
 * pools actions (UNN-309 / UNN-320). Session/status writes still fire
 * `publishEncounterPing` exactly as before; the player watch view polls for
 * spatial changes (ADR — *Realtime: poll-only*).
 */
export async function applyCombatEvent(
  input: ApplyCombatEventInput
): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  const parsed = ApplyCombatEventSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, expectedInstanceVersion, event } =
    parsed.data

  const campaignId = await loadEncounterCampaignId(encounterId)
  if (campaignId === null) return err("encounter-not-found")
  await requireCampaignDM(campaignId)

  if (isMapInstanceEvent(event)) {
    return applySpatialEvent(encounterId, expectedInstanceVersion, event)
  }

  // Single-live-encounter-per-campaign guard (UNN-302): a `startCombat` is
  // rejected if another encounter in this campaign already holds the live slot.
  if (event.kind === "startCombat") {
    const live = await loadLiveEncounterForCampaign(campaignId)
    if (live && live.id !== encounterId) {
      return err("campaign-already-has-live-encounter")
    }
  }

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter === null) return err("encounter-not-found")

  if (event.kind === "addCombatant" || event.kind === "removeCombatant") {
    return applyRosterCrossWrite(
      encounter,
      expectedVersion,
      expectedInstanceVersion,
      event
    )
  }

  if (event.kind === "startCombat") {
    return applyStartCombat(encounter, expectedVersion, event)
  }

  const next = reduceCombatSession(encounter.session, event)
  const saved = await saveEncounterSession(encounterId, next, expectedVersion)
  if (!saved.ok) return saved

  publishEncounterPing(encounter.shortId, {
    version: saved.value.version,
    status: encounter.status,
  })
  revalidateEncounter(encounter)
  return ok({ version: saved.value.version })
}

/**
 * A pure spatial write: load the encounter's Instance, reduce, save the single
 * Instance row guarded on `expectedInstanceVersion`. Fires a `mapInstance`-kind
 * ping on the encounter channel (UNN-468) so the watch refreshes the board over
 * realtime. Returns the bumped **Instance** version.
 */
async function applySpatialEvent(
  encounterId: string,
  expectedInstanceVersion: number | undefined,
  event: MapInstanceEvent
): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  if (expectedInstanceVersion === undefined) {
    return err("missing-instance-version")
  }

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter === null) return err("encounter-not-found")

  const instance = await loadMapInstanceById(encounter.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  const next = reduceMapInstance(instance.state, event)
  const saved = await saveMapInstanceState(
    db,
    encounter.mapInstanceId,
    next,
    expectedInstanceVersion
  )
  if (!saved.ok) return saved

  // A move/spatial event bumps only the Instance row, so tag the ping
  // `mapInstance` (UNN-468) — the watch compares it against the Instance ref and
  // refreshes the board over realtime instead of waiting for the next poll.
  publishEncounterInstancePing(encounter.shortId, saved.value.version)
  revalidateEncounter(encounter)
  return ok({ version: saved.value.version })
}

/**
 * `addCombatant` / `removeCombatant`: the session roster slot (via
 * {@link reduceCombatSession}) and the Instance token (via {@link addOccupant} /
 * {@link removeOccupant}) move together in one {@link guardMany} transaction,
 * guarded on the encounter version and the Instance version respectively. The
 * combatant id keys both rows — for an add it is the client-minted `setup.id`
 * (resolved once here so the reduce and the occupancy write agree). Returns the
 * bumped **encounter** version (the token the session-mirroring client advances).
 */
async function applyRosterCrossWrite(
  encounter: EncounterRow,
  expectedVersion: number,
  expectedInstanceVersion: number | undefined,
  event: Extract<CombatEvent, { kind: "addCombatant" | "removeCombatant" }>
): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  if (expectedInstanceVersion === undefined) {
    return err("missing-instance-version")
  }

  const instance = await loadMapInstanceById(encounter.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  let nextSession
  let nextInstance
  if (event.kind === "addCombatant") {
    const combatantId = event.setup.id ?? crypto.randomUUID()
    const setup = { ...event.setup, id: combatantId }
    nextSession = reduceCombatSession(encounter.session, {
      kind: "addCombatant",
      setup,
    })
    nextInstance = addOccupant(instance.state, combatantId, {
      zoneId: setup.zoneId,
      engagement: setup.engagement ?? { status: "free" },
    })
  } else {
    nextSession = reduceCombatSession(encounter.session, event)
    nextInstance = removeOccupant(instance.state, event.combatantId)
  }

  const result = await guardMany<{ version: number }, ApplyCombatEventError>(
    async (tx: WriteExecutor) => {
      const enc = await saveEncounterSession(
        encounter.id,
        nextSession,
        expectedVersion,
        tx
      )
      if (!enc.ok) return enc
      const inst = await saveMapInstanceState(
        tx,
        encounter.mapInstanceId,
        nextInstance,
        expectedInstanceVersion
      )
      if (!inst.ok) return inst
      return ok({ version: enc.value.version })
    }
  )
  if (!result.ok) return result

  publishEncounterPing(encounter.shortId, {
    version: result.value.version,
    status: encounter.status,
  })
  revalidateEncounter(encounter)
  return ok({ version: result.value.version })
}

/**
 * `startCombat`: the roster-fully-placed guard now reads the Instance
 * (occupancy + zones), and the session save + `draft → live` status flip fold
 * into one {@link guardMany} transaction (both guarded on the encounter version),
 * retiring the old two-write stuck-`draft` recovery dance. Returns the bumped
 * encounter version after the status flip.
 */
async function applyStartCombat(
  encounter: EncounterRow,
  expectedVersion: number,
  event: Extract<CombatEvent, { kind: "startCombat" }>
): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  const instance = await loadMapInstanceById(encounter.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  // Start is the point of no return: once zones are defined, every combatant
  // must be placed (UNN-347). The setup shell gates this client-side as a
  // friendly affordance; this is the authoritative server check.
  const roster = encounter.session.combatants.map((combatant) =>
    toCombatantSetup(combatant, instance.state.occupancy[combatant.id])
  )
  if (!isRosterFullyPlaced(roster, instance.state.geometry.zones)) {
    return err("encounter-has-unplaced-combatants")
  }

  const nextSession = reduceCombatSession(encounter.session, event)

  const result = await guardMany<{ version: number }, ApplyCombatEventError>(
    async (tx: WriteExecutor) => {
      const saved = await saveEncounterSession(
        encounter.id,
        nextSession,
        expectedVersion,
        tx
      )
      if (!saved.ok) return saved
      const live = await setEncounterStatus(
        encounter.id,
        "live",
        saved.value.version,
        tx
      )
      if (!live.ok) return live
      return ok({ version: live.value.version })
    }
  )
  if (!result.ok) return result

  publishEncounterPing(encounter.shortId, {
    version: result.value.version,
    status: "live",
  })
  revalidateEncounter(encounter)
  return ok({ version: result.value.version })
}
