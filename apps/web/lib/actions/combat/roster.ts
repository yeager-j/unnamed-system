"use server"

import {
  addParticipantPaired,
  createReduceSession,
  removeParticipantPaired,
  saveSession,
  type CombatEvent,
  type EncounterState,
} from "@workspace/game-v2/encounter"
import { loadEntity, type Entity } from "@workspace/game-v2/kernel"
import { err, ok, type Result } from "@workspace/result"

import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import {
  loadEncounterEnvelopeById,
  type EncounterEnvelope,
} from "@/lib/db/queries/load-encounter"
import {
  loadEncounterForWriteLocked,
  type LoadedEncounterForWrite,
} from "@/lib/db/queries/load-encounter-session"
import { loadLiveEntityRowById } from "@/lib/db/queries/load-entity"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import {
  loadMapInstanceForWriteLocked,
  saveLockedMapInstanceState,
} from "@/lib/db/writes/map-instance"
import {
  publishEncounterInstancePing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import { revalidateEncounter } from "../encounter/revalidate"
import {
  AddParticipantSchema,
  RemoveParticipantSchema,
  type AddParticipantInput,
  type AppliedRosterChange,
  type RemoveParticipantInput,
  type RosterCommandError,
} from "./roster.schema"

/**
 * The command-owned roster changes (UNN-657): durable add (server hydration,
 * placed or unplaced) and placed inline add through {@link addParticipantAction};
 * paired remove through {@link removeParticipantAction}. Zone-less inline adds
 * are Encounter Replica intent (`encounter.addInlineParticipants`), not
 * commands.
 *
 * The authority contract (no client `expectedVersion`): one `guardMany`
 * transaction locks the Instance then the encounter row (canonical order),
 * re-reads both under their locks, validates lifecycle + membership where it
 * commits, and saves guarded on the locked rows' own versions.
 *
 * Ambiguous-delivery strategy — natural idempotency by client-minted
 * participant id: a redelivered add whose id is already on the locked roster
 * returns `ok` with current versions and writes nothing; a redelivered remove
 * of an absent id does the same. Neither bumps a version, pings, nor
 * revalidates.
 */
export async function addParticipantAction(
  input: AddParticipantInput
): Promise<Result<AppliedRosterChange, RosterCommandError>> {
  const parsed = AddParticipantSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId, setup } = parsed.data

  const envelope = await loadEncounterEnvelopeById(encounterId)
  if (envelope === null) return err("encounter-not-found")
  await requireCampaignDM(envelope.campaignId)

  const zoneId = setup.zoneId

  const result = await runRosterTransaction(envelope, async (tx, loaded) => {
    const { row, loaded: loadedSession } = loaded
    if (
      loadedSession.session.participants.some(
        (participant) => participant.id === setup.id
      )
    ) {
      return ok({ committed: null, version: row.version })
    }

    let joiner: Entity
    if ("entityId" in setup) {
      // Live-only (R1 — UNN-571): the id is client-supplied combat setup, not
      // a pinned locator, so a soft-deleted character can't be wired in.
      const durableRow = await loadLiveEntityRowById(setup.entityId, tx)
      if (durableRow === null) return err("character-not-found")
      const hydrated = loadEntityRow(durableRow)
      if (!hydrated.ok) return err("invalid-entity")
      joiner = hydrated.value
      loadedSession.locators.set(setup.id, {
        storage: "durable",
        entityId: setup.entityId,
      })
    } else {
      const parsedEntity = loadEntity(setup.entity.id, setup.entity.components)
      if (!parsedEntity.ok) return err("invalid-entity")
      joiner = parsedEntity.value
      loadedSession.locators.set(setup.id, {
        storage: "inline",
        entity: setup.entity,
      })
    }

    const addEvent = {
      kind: "addParticipant",
      setup: { id: setup.id, side: setup.side, entity: joiner },
    } satisfies Extract<CombatEvent, { kind: "addParticipant" }>

    if (zoneId === undefined) {
      const next = createReduceSession(newId)(loadedSession.session, addEvent)
      const stored = saveSession(next, loadedSession.locators)
      if (!stored.ok) return err("locator-missing")
      const saved = await saveEncounterSession(
        row.id,
        stored.value,
        row.version,
        tx
      )
      if (!saved.ok) return saved
      return ok({ committed: "session", version: saved.value.version })
    }

    return persistPaired(tx, loaded, (instance) =>
      addParticipantPaired(newId)(
        { session: loadedSession.session, mapInstance: instance },
        addEvent,
        zoneId
      )
    )
  })
  return result
}

export async function removeParticipantAction(
  input: RemoveParticipantInput
): Promise<Result<AppliedRosterChange, RosterCommandError>> {
  const parsed = RemoveParticipantSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId, participantId } = parsed.data

  const envelope = await loadEncounterEnvelopeById(encounterId)
  if (envelope === null) return err("encounter-not-found")
  await requireCampaignDM(envelope.campaignId)

  return runRosterTransaction(envelope, async (tx, loaded) => {
    const { row, loaded: loadedSession } = loaded
    if (
      !loadedSession.session.participants.some(
        (participant) => participant.id === participantId
      )
    ) {
      return ok({ committed: null, version: row.version })
    }

    return persistPaired(tx, loaded, (instance) =>
      removeParticipantPaired(newId)(
        { session: loadedSession.session, mapInstance: instance },
        { kind: "removeParticipant", participantId }
      )
    )
  })
}

interface RosterCommitOutcome {
  /** What the body wrote: both rows, the session only, or nothing (no-op). */
  committed: "paired" | "session" | null
  version: number
  instanceVersion?: number
}

interface LockedRosterContext extends LoadedEncounterForWrite {
  readonly instance: MapInstanceRow
}

/**
 * The shared transaction shell: lock Instance → encounter (canonical order),
 * refuse `ended`, run the body against the locked observation, then fire the
 * pings/revalidation the body's commit scope requires.
 */
async function runRosterTransaction(
  envelope: EncounterEnvelope,
  body: (
    tx: WriteExecutor,
    loaded: LockedRosterContext
  ) => Promise<Result<RosterCommitOutcome, RosterCommandError>>
): Promise<Result<AppliedRosterChange, RosterCommandError>> {
  const result = await guardMany<RosterCommitOutcome, RosterCommandError>(
    async (tx: WriteExecutor) => {
      const instance = await loadMapInstanceForWriteLocked(
        tx,
        envelope.mapInstanceId
      )
      if (!instance.ok) return instance

      const loaded = await loadEncounterForWriteLocked(tx, envelope.id)
      if (!loaded.ok) return loaded
      if (loaded.value.row.status === "ended") return err("encounter-ended")

      return body(tx, { ...loaded.value, instance: instance.value })
    }
  )
  if (!result.ok) return result

  const { committed, version, instanceVersion } = result.value
  if (committed !== null) {
    publishEncounterPing(envelope.shortId, {
      version,
      status: envelope.status,
    })
    if (instanceVersion !== undefined) {
      publishEncounterInstancePing(envelope.shortId, instanceVersion)
    }
    revalidateEncounter(envelope)
  }
  return ok({
    version,
    ...(instanceVersion !== undefined ? { instanceVersion } : {}),
  })
}

/** The paired two-row commit: reduce over the locked Instance state, then
 *  save session + Instance guarded on their locked versions. */
async function persistPaired(
  tx: WriteExecutor,
  loaded: LockedRosterContext,
  reduce: (instanceState: MapInstanceRow["state"]) => EncounterState
): Promise<Result<RosterCommitOutcome, RosterCommandError>> {
  const next = reduce(loaded.instance.state)
  const stored = saveSession(next.session, loaded.loaded.locators)
  if (!stored.ok) return err("locator-missing")

  const saved = await saveEncounterSession(
    loaded.row.id,
    stored.value,
    loaded.row.version,
    tx
  )
  if (!saved.ok) return saved
  const inst = await saveLockedMapInstanceState(
    tx,
    loaded.instance,
    next.mapInstance
  )
  if (!inst.ok) return inst
  return ok({
    committed: "paired",
    version: saved.value.version,
    instanceVersion: inst.value.version,
  })
}

/** Server-side id mint threaded to the reducer + paired helpers. */
const newId = () => crypto.randomUUID()
