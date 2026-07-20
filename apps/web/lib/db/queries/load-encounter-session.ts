import { and, eq } from "drizzle-orm"

import {
  loadSession,
  loadSessionShell,
  storedSessionSchema,
  type LoadedSession,
  type SessionShell,
  type StoredEntity,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { err, ok, type Result } from "@workspace/result"

import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { db, type WriteExecutor } from "@/lib/db/client"
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

export type LoadEncounterSessionError =
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
): Promise<Result<LoadedEncounterForWrite, LoadEncounterSessionError>> {
  const [rawRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)

  return dissolveEncounterRow(rawRow)
}

/**
 * The command coordinator's row-locked twin of {@link loadEncounterForWrite}
 * (UNN-657): `FOR UPDATE` on the encounter row, then the same parse + durable
 * hydration + dissolve — all reads through the transaction, so a command's
 * preconditions, reduction, and save happen against one locked observation.
 * The lock, not a client `expectedVersion`, is the concurrency strategy; the
 * caller saves guarded on the locked row's own version (vacuous guard, the
 * replica-processor precedent).
 */
export async function loadEncounterForWriteLocked(
  tx: WriteExecutor,
  encounterId: string
): Promise<Result<LoadedEncounterForWrite, LoadEncounterSessionError>> {
  const [rawRow] = await tx
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)
    .for("update")

  return dissolveEncounterRow(rawRow, tx)
}

export interface LockedEncounterShell {
  readonly row: Pick<EncounterRow, "id" | "shortId" | "status" | "version">
  readonly shell: SessionShell
}

/**
 * The encounter replica authority's row-locked read (UNN-655): the row's
 * storage-native facts — envelope columns plus the session blob refined
 * through {@link loadSessionShell} — with NO durable hydration, so the read
 * is one consistent observation of exactly what the row stores. The
 * processor holds this lock from read to commit; the lock, not a client
 * token, is that door's concurrency strategy. A blob that fails the
 * persisted-contract parse or the shell refinement is `invalid-session` —
 * a data-integrity refusal the door records rather than retries.
 */
export async function loadEncounterShellForWriteLocked(
  executor: WriteExecutor,
  encounterId: string
): Promise<Result<LockedEncounterShell, EncounterRosterError>> {
  const [row] = await executor
    .select({
      id: encounters.id,
      shortId: encounters.shortId,
      status: encounters.status,
      version: encounters.version,
      session: encounters.session,
    })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)
    .for("update")

  if (!row) return err("encounter-not-found")
  const parsed = storedSessionSchema.safeParse(row.session)
  if (!parsed.success) return err("invalid-session")
  const shell = loadSessionShell(parsed.data)
  if (!shell.ok) return err("invalid-session")
  return ok({
    row: {
      id: row.id,
      shortId: row.shortId,
      status: row.status,
      version: row.version,
    },
    shell: shell.value,
  })
}

/**
 * The snapshot twin of {@link loadEncounterForWrite}, keyed by the watch URL's
 * `shortId` (the read boundary is signed-out-visible, so it never holds a row
 * id). Same parse + dissolve; the result adds `durableOwners` for
 * viewer derivation.
 */
export async function loadEncounterForSnapshot(
  shortId: string
): Promise<Result<LoadedEncounterForSnapshot, LoadEncounterSessionError>> {
  const [rawRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.shortId, shortId))
    .limit(1)

  return dissolveEncounterRow(rawRow)
}

/** The shared parse → hydrate → dissolve core the entry points run. */
export async function dissolveEncounterRow(
  rawRow: EncounterRow | undefined,
  executor: WriteExecutor = db
): Promise<Result<LoadedEncounterForSnapshot, LoadEncounterSessionError>> {
  if (!rawRow) return err("encounter-not-found")

  const parsed = storedSessionSchema.safeParse(rawRow.session)
  if (!parsed.success) return err("invalid-session")
  const row: EncounterRow = { ...rawRow, session: parsed.data }

  const durable = await loadDurableEntities(parsed.data, executor)

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
async function loadDurableEntities(
  stored: StoredSession,
  executor: WriteExecutor = db
): Promise<{
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
  for (const row of await loadEntityRowsByIds(entityIds, executor)) {
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
  for (const pc of await loadPlayerCharacterRowsByIds(entityIds, executor)) {
    owners.set(pc.entityId, pc.userId)
  }

  return { entities, versions, owners }
}

export type EncounterRosterError = "encounter-not-found" | "invalid-session"

export interface LockedEncounterRoster {
  readonly status: EncounterStatus
  readonly durableEntityIds: ReadonlySet<string>
}

/**
 * The **combat license** of one encounter, read under its row lock: whether
 * the encounter is still live, and which entities are still durable
 * participants. Entity ids only, from the stored envelope's locators — never
 * hydrating entities.
 *
 * Locked, not advisory (UNN-646 review). Both facts are preconditions the
 * durable push door COMMITS on, and a precondition checked outside the
 * transaction that acts on it is not a precondition: the replica's rebase can
 * correct a client's projection, but nothing can undo an authority commit
 * made after the roster or the encounter's liveness lapsed. Holding this lock
 * is what makes a removal, or an end-combat sweep, serialize against an
 * in-flight durable push instead of racing it.
 *
 * Result-shaped (unlike `loadLiveEncounterDurableEntityIds`'s fail-closed
 * throw) because a corrupt blob here must become a RECORDED rejection, not a
 * retryable loop.
 */
export async function loadEncounterRosterForWriteLocked(
  executor: WriteExecutor,
  encounterId: string
): Promise<Result<LockedEncounterRoster, EncounterRosterError>> {
  const [row] = await executor
    .select({ session: encounters.session, status: encounters.status })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)
    .for("update")

  if (!row) return err("encounter-not-found")
  const parsed = storedSessionSchema.safeParse(row.session)
  if (!parsed.success) return err("invalid-session")
  return ok({
    status: row.status,
    durableEntityIds: new Set(
      parsed.data.participants.flatMap((participant) =>
        participant.locator.storage === "durable"
          ? [participant.locator.entityId]
          : []
      )
    ),
  })
}

/**
 * The campaign's single `live` encounter **id**, or `null` — the blob-agnostic
 * read behind the single-live guard. Selects two columns; never reads
 * `session`. Takes an optional `executor` so a lifecycle transaction can
 * re-check it **after** taking the dungeon-row lock (UNN-589 D11) — the
 * default-`db` call remains the friendly pre-check.
 */
export async function loadLiveEncounterIdForCampaign(
  campaignId: string,
  executor: WriteExecutor = db
): Promise<string | null> {
  const [row] = await executor
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
 * `EncounterForDM` / snapshot load. Takes an optional `executor` for the same
 * in-transaction re-check `loadLiveEncounterIdForCampaign` documents (UNN-589
 * D11: expedition finish refuses under a live encounter on *this* instance,
 * read after the dungeon-row lock).
 */
export async function loadLiveEncounterForMapInstance(
  mapInstanceId: string,
  executor: WriteExecutor = db
): Promise<{ id: string; shortId: string; status: EncounterStatus } | null> {
  const [row] = await executor
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
