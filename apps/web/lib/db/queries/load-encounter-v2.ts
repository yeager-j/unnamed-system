import { and, eq } from "drizzle-orm"

import {
  loadSession,
  storedSessionSchema,
  type LoadedSession,
  type StoredEntity,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { db } from "@/lib/db/client"
import { loadEntityRowsByIds } from "@/lib/db/queries/load-entity"
import { loadPlayerCharacterRowsByIds } from "@/lib/db/queries/load-player-character"
import {
  encounters,
  type EncounterRow,
  type EncounterStatus,
} from "@/lib/db/schema/encounter"

/**
 * The **encounter blob loader** (UNN-520 write path; UNN-530 snapshot path) —
 * the one place the `session` jsonb is parsed and dissolved (the blob-free
 * column reads live in `load-encounter.ts`). Two boundary responsibilities:
 *
 * 1. **The blob parses through {@link storedSessionSchema}** (the F6 discipline —
 *    never a `$type` cast), then {@link loadSession} dissolves each participant's
 *    storage home into a uniform `Participant.entity`, returning the out-of-band
 *    locator map the write side keys every home decision on.
 * 2. **Durable participants hydrate from their `entity` rows** (UNN-551): the
 *    locators' `entityId`s batch-load `entity` rows and assemble into the runtime
 *    `Entity` (signed depletion is stored natively, so there is no absolute-pool
 *    join — the row *is* the truth), and each row's `vitalsVersion` is returned
 *    alongside as the durable write arm's guard token. The snapshot path
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
 * Batch-loads every durable locator's `entity` row and assembles it into the
 * {@link StoredEntity} shape the engine's `DurableSource` serves, plus each row's
 * `vitalsVersion` and `ownerId`. A missing row — or one whose stored components
 * fail the load-seam shape validation — is simply absent from the maps, and the
 * engine's loader reports it as a `missing-durable` issue with the offending
 * participant id, so the miss is decided in one place.
 *
 * The snapshot fold reads by **pinned entity id** through `loadEntityRowsByIds`,
 * which stays `deletedAt`-blind (R1 — UNN-571): a soft-deleted row must still
 * hydrate its participant rather than become a `missing-durable` dangling ref
 * that 404s the whole encounter. The live-encounter lock keeps tombstones out of
 * live fights; for a non-live encounter a tombstoned participant renders as
 * history (D4). See `schema/entity.ts`.
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
  for (const row of await loadEntityRowsByIds(entityIds)) {
    const loaded = loadEntityRow(row)
    if (!loaded.ok) continue
    entities.set(row.id, {
      id: loaded.value.id,
      components: loaded.value.components,
    })
    versions.set(row.id, row.vitalsVersion)
  }

  // Ownership moved to the PC subtype (R3 — UNN-573); durable combatants are PCs,
  // so their `userId` is the owner the snapshot authorizes the own-sheet column on.
  const owners = new Map<string, string>()
  for (const pc of await loadPlayerCharacterRowsByIds(entityIds)) {
    owners.set(pc.entityId, pc.userId)
  }

  return { entities, versions, owners }
}

/**
 * The campaign's single `live` encounter **id**, or `null` — the blob-agnostic
 * read behind the single-live guard. Selects two columns; never reads
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
 * The envelope of the single `live` encounter running on a given **Map Instance**,
 * or `null` when none is — the blob-agnostic read behind a delve's combat-vs-explore
 * mode fork (UNN-536). Matches on `mapInstanceId` (not `campaignId`): a campaign can
 * hold a live standalone encounter on a *different* Instance, which is not this
 * delve's fight. Selects three envelope columns; never reads or parses `session`, so
 * the page loader can decide the mode cheaply before committing to the heavier
 * `EncounterForDM` / snapshot load.
 */
export async function loadLiveEncounterForMapInstance(
  mapInstanceId: string
): Promise<{ id: string; shortId: string; status: EncounterStatus } | null> {
  const [row] = await db
    .select({
      id: encounters.id,
      shortId: encounters.shortId,
      status: encounters.status,
    })
    .from(encounters)
    .where(
      and(
        eq(encounters.mapInstanceId, mapInstanceId),
        eq(encounters.status, "live")
      )
    )
    .limit(1)

  return row ?? null
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
