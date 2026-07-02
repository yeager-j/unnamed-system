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
 * The **v2 encounter loader** (UNN-520 write path; UNN-530 snapshot path) — the
 * parallel twin of {@link import("./load-encounter").loadEncounterRowById} for
 * encounters whose `session` blob holds a v2 {@link StoredSession}. Two boundary
 * differences:
 *
 * 1. **The blob parses through {@link storedSessionSchema}** (the F6 discipline —
 *    never a `$type` cast), then {@link loadSession} dissolves each participant's
 *    storage home into a uniform `Participant.entity`, returning the out-of-band
 *    locator map the write side keys every home decision on.
 * 2. **Durable participants hydrate from their character rows**: the locators'
 *    `entityId`s batch-load through the `rawInputsToEntity` projection, and each
 *    row's `vitalsVersion` is returned alongside — the expected-version token the
 *    durable write arm (the UNN-520 write-router) guards on. The snapshot path
 *    additionally reads each row's `ownerId` (the viewer-derivation input) and
 *    folds the versions into the composite snapshot version.
 */

export interface LoadedEncounterForWrite {
  row: EncounterRow
  loaded: LoadedSession
  /** Each durable participant's character `vitalsVersion`, keyed by entity id. */
  durableVersions: Map<string, number>
}

/** The snapshot read adds the ownership dimension `deriveViewer` consumes. */
export interface LoadedEncounterForSnapshot extends LoadedEncounterForWrite {
  /** Each durable participant's character `ownerId`, keyed by entity id. */
  durableOwners: Map<string, string>
}

export type LoadEncounterV2Error =
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
): Promise<Result<LoadedEncounterForWrite, LoadEncounterV2Error>> {
  const [rawRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)

  return dissolveEncounterRow(rawRow)
}

/**
 * The snapshot twin of {@link loadEncounterForWrite}, keyed by the watch URL's
 * `shortId` (the read boundary is signed-out-visible, so it never holds a row
 * id). Same parse + dissolve; the result adds `durableOwners` for
 * viewer derivation.
 */
export async function loadEncounterForSnapshot(
  shortId: string
): Promise<Result<LoadedEncounterForSnapshot, LoadEncounterV2Error>> {
  const [rawRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.shortId, shortId))
    .limit(1)

  return dissolveEncounterRow(rawRow)
}

/** The shared parse → hydrate → dissolve core both entry points run. */
async function dissolveEncounterRow(
  rawRow: EncounterRow | undefined
): Promise<Result<LoadedEncounterForSnapshot, LoadEncounterV2Error>> {
  if (!rawRow) return err("encounter-not-found")

  const parsed = storedSessionSchema.safeParse(rawRow.session)
  if (!parsed.success) return err("invalid-session")
  const row: EncounterRow = { ...rawRow, session: parsed.data }

  const durable = await loadDurableEntities(parsed.data)

  const loaded = loadSession((entityId) => durable.entities.get(entityId))(
    parsed.data
  )
  if (!loaded.ok) return err("participant-load-failed")

  return ok({
    row,
    loaded: loaded.value,
    durableVersions: durable.versions,
    durableOwners: durable.owners,
  })
}

/**
 * Batch-hydrates every durable locator's character row into the
 * {@link StoredEntity} shape the engine's `DurableSource` serves, plus each
 * row's `vitalsVersion` and `ownerId`. A missing row is simply absent from the
 * maps — the engine's loader reports it as a `missing-durable` issue with the
 * offending participant id, so the miss is decided in one place.
 */
async function loadDurableEntities(stored: StoredSession): Promise<{
  entities: Map<string, StoredEntity>
  versions: Map<string, number>
  owners: Map<string, string>
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
  const owners = new Map<string, string>()
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
    owners.set(entityId, raw.row.ownerId)
  }

  return { entities, versions, owners }
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

/**
 * The **durable** (character-row) participant entity ids of the campaign's
 * single `live` encounter, or `null` when none is live. The live-encounter
 * lock's read (UNN-330 → UNN-535): v1's "PC combatant" generalizes to v2's
 * durable-locator participant — the lifecycle axis, not a kind tag. Reads only
 * the stored envelope (locators), never hydrates entities; a corrupt blob
 * throws (fail-closed — a lock that silently opened mid-fight would be worse).
 */
export async function loadLiveEncounterDurableEntityIds(
  campaignId: string
): Promise<string[] | null> {
  const [row] = await db
    .select({ session: encounters.session })
    .from(encounters)
    .where(
      and(eq(encounters.campaignId, campaignId), eq(encounters.status, "live"))
    )
    .limit(1)

  if (!row) return null
  const stored = storedSessionSchema.parse(row.session)
  return [
    ...new Set(
      stored.participants.flatMap((participant) =>
        participant.locator.storage === "durable"
          ? [participant.locator.entityId]
          : []
      )
    ),
  ]
}
