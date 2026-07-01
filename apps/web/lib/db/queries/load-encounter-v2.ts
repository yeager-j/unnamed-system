import { and, eq } from "drizzle-orm"

import {
  loadSession,
  storedSessionSchema,
  type LoadedSession,
  type StoredEntity,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { err, ok, type Result } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { loadRawCharacterInputsById } from "@/lib/db/queries/load-character"
import { encounters, type EncounterRow } from "@/lib/db/schema/encounter"
import { rawInputsToEntity } from "@/lib/game-v2/raw-inputs-to-entity"

/**
 * The **v2 write-path encounter loader** (UNN-520) — the parallel twin of
 * {@link import("./load-encounter").loadEncounterRowById} for encounters whose
 * `session` blob holds a v2 {@link StoredSession}. Two boundary differences:
 *
 * 1. **The blob parses through {@link storedSessionSchema}** (the F6 discipline —
 *    never a `$type` cast), then {@link loadSession} dissolves each participant's
 *    storage home into a uniform `Participant.entity`, returning the out-of-band
 *    locator map the write side keys every home decision on.
 * 2. **Durable participants hydrate from their character rows**: the locators'
 *    `entityId`s batch-load through the `rawInputsToEntity` projection, and each
 *    row's `vitalsVersion` is returned alongside — the expected-version token the
 *    durable write arm (the UNN-520 write-router) guards on.
 *
 * Write-path only: the v2 **snapshot/read** boundary (viewer derivation, the
 * composite version fold, redaction) is a separate follow-up ticket.
 */

/** The encounter row with its blob re-typed to the parsed v2 contract. */
export type EncounterRowV2 = Omit<EncounterRow, "session"> & {
  session: StoredSession
}

export interface LoadedEncounterForWrite {
  row: EncounterRowV2
  loaded: LoadedSession
  /** Each durable participant's character `vitalsVersion`, keyed by entity id. */
  durableVersions: Map<string, number>
}

export type LoadEncounterForWriteError =
  | "encounter-not-found"
  | "invalid-session"
  | "participant-load-failed"

/**
 * Loads + dissolves the full v2 write-side state for one encounter. Errs with
 * `invalid-session` when the blob fails the persisted-contract parse and
 * `participant-load-failed` when any participant fails to dissolve (a dangling
 * durable reference, an invalid entity/overlay) — both are data-integrity
 * failures the action surfaces rather than papers over.
 */
export async function loadEncounterForWrite(
  encounterId: string
): Promise<Result<LoadedEncounterForWrite, LoadEncounterForWriteError>> {
  const [rawRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)
  if (!rawRow) return err("encounter-not-found")

  const parsed = storedSessionSchema.safeParse(rawRow.session)
  if (!parsed.success) return err("invalid-session")
  const row: EncounterRowV2 = { ...rawRow, session: parsed.data }

  const durable = await loadDurableEntities(parsed.data)

  const loaded = loadSession((entityId) => durable.entities.get(entityId))(
    parsed.data
  )
  if (!loaded.ok) return err("participant-load-failed")

  return ok({ row, loaded: loaded.value, durableVersions: durable.versions })
}

/**
 * Batch-hydrates every durable locator's character row into the
 * {@link StoredEntity} shape the engine's `DurableSource` serves, plus each
 * row's `vitalsVersion`. A missing row is simply absent from the map — the
 * engine's loader reports it as a `missing-durable` issue with the offending
 * participant id, so the miss is decided in one place.
 */
async function loadDurableEntities(stored: StoredSession): Promise<{
  entities: Map<string, StoredEntity>
  versions: Map<string, number>
}> {
  const entityIds = [
    ...new Set(
      stored.participants.flatMap((participant) =>
        participant.locator.storage === "durable"
          ? [participant.locator.entityId]
          : []
      )
    ),
  ]

  const entities = new Map<string, StoredEntity>()
  const versions = new Map<string, number>()
  const loadedRows = await Promise.all(
    entityIds.map(async (entityId) => ({
      entityId,
      raw: await loadRawCharacterInputsById(entityId),
    }))
  )
  for (const { entityId, raw } of loadedRows) {
    if (raw === null) continue
    const entity = rawInputsToEntity(raw)
    entities.set(entityId, { id: entity.id, components: entity.components })
    versions.set(entityId, raw.row.vitalsVersion)
  }

  return { entities, versions }
}

/**
 * The campaign's single `live` encounter **id**, or `null` — the blob-agnostic
 * variant of {@link import("./load-encounter").loadLiveEncounterForCampaign}
 * for the v2 single-live guard (that one parses the blob through v1's schema,
 * which a v2 encounter's blob would fail). Selects two columns; never reads
 * `session`.
 */
export async function loadLiveEncounterIdForCampaign(
  campaignId: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: encounters.id })
    .from(encounters)
    .where(
      and(eq(encounters.campaignId, campaignId), eq(encounters.status, "live"))
    )
    .limit(1)

  return row?.id ?? null
}
