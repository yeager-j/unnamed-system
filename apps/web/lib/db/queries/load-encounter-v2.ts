import { and, eq } from "drizzle-orm"

import {
  loadSession,
  storedSessionSchema,
  type LoadedSession,
  type StoredEntity,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel"
import { err, ok, type Result } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { loadRawCharacterInputsById } from "@/lib/db/queries/load-character"
import {
  encounters,
  type EncounterRow,
  type EncounterStatus,
} from "@/lib/db/schema/encounter"
import { resolveEntity } from "@/lib/game-engine-v2"
import { rawInputsToEntity } from "@/lib/game-v2/raw-inputs-to-entity"

/**
 * The **encounter blob loader** (UNN-520 write path; UNN-530 snapshot path) —
 * the one place the `session` jsonb is parsed and dissolved (the blob-free
 * column reads live in `load-encounter.ts`). Two boundary responsibilities:
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
    const entity = withRowDepletion(
      rawInputsToEntity(raw),
      raw.row.currentHP,
      raw.row.currentSP
    )
    entities.set(entityId, { id: entity.id, components: entity.components })
    versions.set(entityId, raw.row.vitalsVersion)
    owners.set(entityId, raw.row.ownerId)
  }

  return { entities, versions, owners }
}

/**
 * Joins the character row's **absolute** pools onto the projected entity as v2
 * **signed depletion** (UNN-535 — the conversion `rawInputsToEntity` documents
 * as "at cutover"): the projection can't know `damage = maxHP − currentHP`
 * because the maxima are derived, so this boundary resolves the entity once and
 * back-computes both depletions. Over-max v1 pools come out as negative
 * depletion — exactly v2's over-max representation. The sheet path is untouched
 * (its current pools stay CharacterRow passthrough, UNN-533); this join is the
 * encounter loader's, so console, watch, and the write-router's validation all
 * see the durable participant's true pools.
 */
function withRowDepletion(
  entity: Entity,
  currentHP: number,
  currentSP: number
): Entity {
  const resolved = resolveEntity(entity)
  const maxHP = resolved.components.vitals?.maxHP ?? 0
  const maxSP = resolved.components.skillPool?.maxSP ?? 0
  return {
    ...entity,
    components: {
      ...entity.components,
      vitals: {
        ...(entity.components.vitals ?? { base: 0 }),
        damage: maxHP - currentHP,
      },
      skillPool: {
        ...(entity.components.skillPool ?? { base: 0 }),
        spSpent: maxSP - currentSP,
      },
    },
  }
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
