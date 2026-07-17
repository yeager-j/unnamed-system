"use server"

import {
  addParticipantPaired,
  createReduceSession,
  isRosterFullyPlaced,
  removeParticipantPaired,
  saveSession,
  type CombatEvent,
  type EncounterState,
  type LoadedSession,
  type Session,
} from "@workspace/game-v2/encounter"
import { loadEntity, type Entity } from "@workspace/game-v2/kernel"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  reduceMapInstance as createReduceMapInstance,
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db, type WriteExecutor } from "@/lib/db/client"
import { loadEncounterCampaignId } from "@/lib/db/queries/load-encounter"
import {
  loadEncounterForWrite,
  loadLiveEncounterIdForCampaign,
} from "@/lib/db/queries/load-encounter-session"
import { loadLiveEntityRowById } from "@/lib/db/queries/load-entity"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import {
  saveEncounterSession,
  setEncounterStatus,
} from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import {
  publishEncounterInstancePing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import { revalidateEncounter } from "../encounter/revalidate"
import {
  ApplyCombatEventSchema,
  type AddParticipantWireEvent,
  type AppliedCombatEvent,
  type ApplyCombatEventError,
  type ApplyCombatEventInput,
} from "./apply-event.schema"

/**
 * The **v2 generic-wire shell** (UNN-520) — the parallel twin of v1's
 * `applyCombatEvent` over engine-v2: it applies one wire event to a v2
 * encounter and saves the result, version-guarded. The routing structure
 * mirrors v1 exactly; the differences are the v2 seams:
 *
 * - The encounter loads through {@link loadEncounterForWrite} (blob parsed as
 *   {@link import("@workspace/game-v2/encounter").StoredSession}, storage homes
 *   dissolved, the out-of-band locator map in hand), and **every** save path
 *   serializes through the fail-closed {@link saveSession} — a participant
 *   missing from the locator map is a hard `locator-missing` error, never a
 *   silent inline fallback (the S1 invariant).
 * - `addParticipant`/`removeParticipant` route through the engine's pure paired
 *   helpers ({@link addParticipantPaired}/{@link removeParticipantPaired}), so
 *   the roster slot and the occupancy token can't disagree; the two rows commit
 *   in one {@link guardMany} transaction. A **durable** joiner (`{ entityId }`,
 *   R6.2) hydrates from its character row and registers its durable locator
 *   before the save — the fail-closed saver turns a forgotten registration into
 *   a test failure rather than a home-loss data bug.
 * - The envelope inherits the `ComponentWriteEvent` exclusion (CD19): vitals /
 *   durable component writes are unrepresentable here and travel only through
 *   the write-router's own action (`./commit/`).
 *
 * Auth-first like v1: `requireCampaignDM` trips `forbidden()` before any heavy
 * load. Pings + revalidation reuse the existing encounter channel machinery.
 */
export async function applyCombatEventAction(
  input: ApplyCombatEventInput
): Promise<Result<AppliedCombatEvent, ApplyCombatEventError>> {
  const parsed = ApplyCombatEventSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, expectedInstanceVersion, event } =
    parsed.data

  const campaignId = await loadEncounterCampaignId(encounterId)
  if (campaignId === null) return err("encounter-not-found")
  await requireCampaignDM(campaignId)

  const loaded = await loadEncounterForWrite(encounterId)
  if (!loaded.ok) return loaded
  const { row, loaded: loadedSession } = loaded.value

  if (isMapInstanceEvent(event)) {
    return applySpatialEvent(row, expectedInstanceVersion, event)
  }

  if (event.kind === "addParticipant") {
    return applyAddParticipant(
      row,
      loadedSession,
      expectedVersion,
      expectedInstanceVersion,
      event
    )
  }

  if (event.kind === "removeParticipant") {
    return applyRemoveParticipant(
      row,
      loadedSession,
      expectedVersion,
      expectedInstanceVersion,
      event
    )
  }

  if (event.kind === "startCombat") {
    return applyStartCombat(
      row,
      loadedSession,
      campaignId,
      expectedVersion,
      event
    )
  }

  const next = createReduceSession(newId)(loadedSession.session, event)
  return persistSession(row, next, loadedSession, expectedVersion, row.status)
}

/** Server-side id mint shared by the reducer + paired helpers. */
const newId = () => crypto.randomUUID()

/**
 * Routes a parsed wire event to the spatial arm — the combat and spatial unions
 * share no `kind`, so the discriminated-union parse is a cheap discriminator
 * check (the engine's own routing doctrine, `reduce-encounter.ts`).
 */
function isMapInstanceEvent(event: unknown): event is MapInstanceEvent {
  return mapInstanceEventSchema.safeParse(event).success
}

/**
 * Serializes (fail-closed) + saves the reduced session, then fires the
 * encounter ping — the shared tail of every session-only write path.
 */
async function persistSession(
  row: EncounterRow,
  session: Session,
  loadedSession: LoadedSession,
  expectedVersion: number,
  pingStatus: EncounterRow["status"]
): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  const stored = saveSession(session, loadedSession.locators)
  if (!stored.ok) return err("locator-missing")

  const saved = await saveEncounterSession(
    row.id,
    stored.value,
    expectedVersion
  )
  if (!saved.ok) return saved

  publishEncounterPing(row.shortId, {
    version: saved.value.version,
    status: pingStatus,
  })
  revalidateEncounter(row)
  return ok({ version: saved.value.version })
}

/**
 * A pure spatial write: reduce the encounter's Instance with the v2 spatial
 * reducer, save the single Instance row guarded on `expectedInstanceVersion`,
 * ping the Instance stream on the encounter channel.
 */
async function applySpatialEvent(
  row: EncounterRow,
  expectedInstanceVersion: number | undefined,
  event: MapInstanceEvent
): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  if (expectedInstanceVersion === undefined) {
    return err("missing-instance-version")
  }

  const instance = await loadMapInstanceById(row.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  const next = createReduceMapInstance(newId)(instance.state, event)
  const saved = await saveMapInstanceState(
    db,
    row.mapInstanceId,
    next,
    expectedInstanceVersion
  )
  if (!saved.ok) return saved

  publishEncounterInstancePing(row.shortId, saved.value.version)
  revalidateEncounter(row)
  return ok({ version: saved.value.version })
}

/**
 * `addParticipant`: resolves the joiner's entity from its wire source — inline
 * (`{ entity }`, validated through the {@link loadEntity} F6 seam) or durable
 * (`{ entityId }`, assembled from the `entity` row through
 * {@link loadEntityRow}) — **registers its locator in the out-of-band map**,
 * then runs the engine's paired cross-write. A placed add (`zoneId` present)
 * commits both rows in one {@link guardMany} transaction; a zone-less add (the
 * setup console's add-then-place flow, UNN-535) touches only the session row —
 * the joiner holds no occupancy token until a `placeCombatant` event mints it.
 */
async function applyAddParticipant(
  row: EncounterRow,
  loadedSession: LoadedSession,
  expectedVersion: number,
  expectedInstanceVersion: number | undefined,
  event:
    | AddParticipantWireEvent
    | Extract<CombatEvent, { kind: "addParticipant" }>
): Promise<Result<AppliedCombatEvent, ApplyCombatEventError>> {
  const setup = event.setup
  const zoneId = "zoneId" in setup ? setup.zoneId : undefined

  const participantId = setup.id ?? asParticipantId(newId())

  let entity: Entity
  if ("entityId" in setup) {
    // Live-only (R1 — UNN-571): the id is client-supplied combat setup, not a
    // pinned locator, so a soft-deleted character can't be wired into the fight.
    const durableRow = await loadLiveEntityRowById(setup.entityId)
    if (durableRow === null) return err("character-not-found")
    const loaded = loadEntityRow(durableRow)
    if (!loaded.ok) return err("invalid-entity")
    entity = loaded.value
    loadedSession.locators.set(participantId, {
      storage: "durable",
      entityId: setup.entityId,
    })
  } else {
    const loadedEntity = loadEntity(setup.entity.id, setup.entity.components)
    if (!loadedEntity.ok) return err("invalid-entity")
    entity = loadedEntity.value
    loadedSession.locators.set(participantId, {
      storage: "inline",
      entity: setup.entity,
    })
  }

  const addEvent = {
    kind: "addParticipant",
    setup: { id: participantId, side: setup.side, entity },
  } satisfies Extract<CombatEvent, { kind: "addParticipant" }>

  if (zoneId === undefined) {
    const next = createReduceSession(newId)(loadedSession.session, addEvent)
    return persistSession(row, next, loadedSession, expectedVersion, row.status)
  }

  if (expectedInstanceVersion === undefined) {
    return err("missing-instance-version")
  }

  const instance = await loadMapInstanceById(row.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  const next = addParticipantPaired(newId)(
    { session: loadedSession.session, mapInstance: instance.state },
    addEvent,
    zoneId
  )

  return persistPaired(
    row,
    next,
    loadedSession,
    expectedVersion,
    expectedInstanceVersion
  )
}

/**
 * `removeParticipant`: the engine's paired remove (roster slot dropped +
 * occupancy token pruned with the engagement sever), both rows in one
 * transaction. The departed id's locator entry is simply never read again — the
 * saver keys off the surviving roster.
 */
async function applyRemoveParticipant(
  row: EncounterRow,
  loadedSession: LoadedSession,
  expectedVersion: number,
  expectedInstanceVersion: number | undefined,
  event: Extract<CombatEvent, { kind: "removeParticipant" }>
): Promise<Result<AppliedCombatEvent, ApplyCombatEventError>> {
  if (expectedInstanceVersion === undefined) {
    return err("missing-instance-version")
  }

  const instance = await loadMapInstanceById(row.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  const next = removeParticipantPaired(newId)(
    { session: loadedSession.session, mapInstance: instance.state },
    event
  )

  return persistPaired(
    row,
    next,
    loadedSession,
    expectedVersion,
    expectedInstanceVersion
  )
}

/**
 * The shared two-row commit for the paired roster cross-writes: session blob +
 * Instance state in one {@link guardMany} transaction, guarded on their own
 * version tokens. Returns the bumped **encounter** version (the token the
 * session-mirroring client advances) plus the bumped **Instance** version (the
 * client folds it into the Instance queue's ref — UNN-567), and pings both
 * streams.
 */
async function persistPaired(
  row: EncounterRow,
  next: EncounterState,
  loadedSession: LoadedSession,
  expectedVersion: number,
  expectedInstanceVersion: number
): Promise<Result<AppliedCombatEvent, ApplyCombatEventError>> {
  const stored = saveSession(next.session, loadedSession.locators)
  if (!stored.ok) return err("locator-missing")

  const result = await guardMany<
    { version: number; instanceVersion: number },
    ApplyCombatEventError
  >(async (tx: WriteExecutor) => {
    const enc = await saveEncounterSession(
      row.id,
      stored.value,
      expectedVersion,
      tx
    )
    if (!enc.ok) return enc
    const inst = await saveMapInstanceState(
      tx,
      row.mapInstanceId,
      next.mapInstance,
      expectedInstanceVersion
    )
    if (!inst.ok) return inst
    return ok({
      version: enc.value.version,
      instanceVersion: inst.value.version,
    })
  })
  if (!result.ok) return result

  publishEncounterPing(row.shortId, {
    version: result.value.version,
    status: row.status,
  })
  publishEncounterInstancePing(row.shortId, result.value.instanceVersion)
  revalidateEncounter(row)
  return ok(result.value)
}

/**
 * `startCombat`: the single-live-per-campaign guard (blob-agnostic id lookup) +
 * the authoritative placement check (once zones are defined, every participant
 * must hold a token in a real zone), then the session save + `draft → live`
 * status flip fold into one {@link guardMany} transaction.
 */
async function applyStartCombat(
  row: EncounterRow,
  loadedSession: LoadedSession,
  campaignId: string,
  expectedVersion: number,
  event: Extract<CombatEvent, { kind: "startCombat" }>
): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  const liveId = await loadLiveEncounterIdForCampaign(campaignId)
  if (liveId !== null && liveId !== row.id) {
    return err("campaign-already-has-live-encounter")
  }

  const instance = await loadMapInstanceById(row.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  if (!isRosterFullyPlaced(loadedSession.session, instance.state)) {
    return err("encounter-has-unplaced-combatants")
  }

  const next = createReduceSession(newId)(loadedSession.session, event)
  const stored = saveSession(next, loadedSession.locators)
  if (!stored.ok) return err("locator-missing")

  const result = await guardMany<{ version: number }, ApplyCombatEventError>(
    async (tx: WriteExecutor) => {
      const saved = await saveEncounterSession(
        row.id,
        stored.value,
        expectedVersion,
        tx
      )
      if (!saved.ok) return saved
      const live = await setEncounterStatus(
        row.id,
        "live",
        saved.value.version,
        tx
      )
      if (!live.ok) return live
      return ok({ version: live.value.version })
    }
  )
  if (!result.ok) return result

  publishEncounterPing(row.shortId, {
    version: result.value.version,
    status: "live",
  })
  revalidateEncounter(row)
  return ok({ version: result.value.version })
}
