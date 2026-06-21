import { and, desc, eq } from "drizzle-orm"

import { combatSessionSchema } from "@workspace/game/foundation"

import { db, type WriteExecutor } from "@/lib/db/client"
import {
  encounters,
  type EncounterRow,
  type EncounterStatus,
} from "@/lib/db/schema/encounter"

/**
 * Reads for the `encounters` table. Unlike the character loader there is no
 * game-engine *hydrate* step — the `session` jsonb already is the full tracker
 * state. It is, however, run through {@link withParsedSession} on read so the
 * column's compile-time `$type` cast can't hand a caller a blob that predates a
 * schema field. The player-view projection that strips enemy affinities is a
 * separate concern (UNN-322). The only non-db-domain import is the engine's
 * `combatSessionSchema`, which `schema/encounter.ts` already depends on.
 */

/**
 * Parses the raw jsonb `session` through {@link combatSessionSchema} so zod
 * defaults run on read. The column is typed by a compile-time `$type` cast with
 * no runtime check, so a blob persisted before a field existed would otherwise
 * reach callers with that field `undefined` — contradicting the `CombatSession`
 * type and, e.g., flipping the drawer's action-economy `Toggle` from uncontrolled
 * to controlled (UNN-310). Parsing once here keeps every loaded `EncounterRow`
 * honest end-to-end, so no consumer has to defensively coerce.
 */
function withParsedSession(row: EncounterRow): EncounterRow {
  return { ...row, session: combatSessionSchema.parse(row.session) }
}

/** The `encounters` row by id (session parsed), or `null` when none matches. */
export async function loadEncounterRowById(
  encounterId: string
): Promise<EncounterRow | null> {
  const [row] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)

  return row ? withParsedSession(row) : null
}

/**
 * The raw `encounters` row by public `shortId`, or `null` when none matches —
 * the lookup the signed-out player watch view uses (UNN-322).
 */
export async function loadEncounterRowByShortId(
  shortId: string
): Promise<EncounterRow | null> {
  const [row] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.shortId, shortId))
    .limit(1)

  return row ? withParsedSession(row) : null
}

/**
 * The encounter's current optimistic `version` only (by public `shortId`), or
 * `null` when no encounter matches. Backs the client stale-retry path
 * (`getEncounterVersionAction`, UNN-378): when a guarded write returns `"stale"`,
 * the queued-write hook refetches the fresh token here and retries once. Selects
 * one column, so the read is index-light.
 */
export async function loadEncounterVersionByShortId(
  shortId: string
): Promise<number | null> {
  const [row] = await db
    .select({ version: encounters.version })
    .from(encounters)
    .where(eq(encounters.shortId, shortId))
    .limit(1)

  return row?.version ?? null
}

/**
 * The encounter's `campaignId` only, or `null` when no encounter matches. Lets
 * the impure shell (`applyCombatEvent`, UNN-332) authorize the caller against the
 * owning campaign (`requireCampaignDM`) *before* loading the `session` blob, so a
 * non-DM is rejected without the session ever being read. Selects one column, so
 * the read is index-light.
 */
export async function loadEncounterCampaignId(
  encounterId: string
): Promise<string | null> {
  const [row] = await db
    .select({ campaignId: encounters.campaignId })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)

  return row?.campaignId ?? null
}

/**
 * Cheap existence check used by the guarded session writes to disambiguate a
 * zero-row `UPDATE` between `"encounter-not-found"` (the row is gone) and
 * `"stale"` (it exists but its `version` moved past the caller's token). Selects
 * only `id` so the read is index-only.
 */
export async function encounterExists(
  encounterId: string,
  executor: WriteExecutor = db
): Promise<boolean> {
  const [row] = await executor
    .select({ id: encounters.id })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)

  return row !== undefined
}

/** Summary row for the manage page's encounter list (UNN-329) — the columns the
 *  list renders, never the heavy `session` blob. */
export interface EncounterSummary {
  id: string
  shortId: string
  name: string
  status: EncounterStatus
  createdAt: Date
}

/**
 * Every encounter in a campaign, newest first, as the lightweight
 * {@link EncounterSummary} projection (no `session` jsonb). Backs the manage
 * page's encounter list (UNN-329); the single live one for the banner comes from
 * {@link loadLiveEncounterForCampaign}.
 */
export async function loadEncountersForCampaign(
  campaignId: string
): Promise<EncounterSummary[]> {
  return db
    .select({
      id: encounters.id,
      shortId: encounters.shortId,
      name: encounters.name,
      status: encounters.status,
      createdAt: encounters.createdAt,
    })
    .from(encounters)
    .where(eq(encounters.campaignId, campaignId))
    .orderBy(desc(encounters.createdAt))
}

/**
 * The campaign's single `live` encounter, or `null` if none is live. Backs the
 * single-live-encounter-per-campaign guard (UNN-302, ADR Decision 3): the
 * `startCombat` path reads this before flipping a draft to `live` and rejects
 * the transition when another encounter in the same campaign already holds the
 * slot. App-side enforcement — there is no DB uniqueness constraint for MVP.
 */
export async function loadLiveEncounterForCampaign(
  campaignId: string
): Promise<EncounterRow | null> {
  const [row] = await db
    .select()
    .from(encounters)
    .where(
      and(eq(encounters.campaignId, campaignId), eq(encounters.status, "live"))
    )
    .limit(1)

  return row ? withParsedSession(row) : null
}

/**
 * The single `live` encounter running on a given Map Instance, or `null` if none.
 * The shared-row invariant (Dungeon Map ADR — *one Instance ↔ at most one live
 * Encounter*) means this resolves the encounter a **dungeon delve** is fighting:
 * the `/dungeon/{shortId}` console forks into its combat phase and the fog player
 * view composes the watch when this returns a row referencing the dungeon's
 * `mapInstanceId`. Matching on `mapInstanceId` (not just `campaignId`) is the
 * exact join — a campaign could hold a live *standalone* encounter on a different
 * Instance, which is not this delve's fight.
 */
export async function loadLiveEncounterForMapInstance(
  mapInstanceId: string
): Promise<EncounterRow | null> {
  const [row] = await db
    .select()
    .from(encounters)
    .where(
      and(
        eq(encounters.mapInstanceId, mapInstanceId),
        eq(encounters.status, "live")
      )
    )
    .limit(1)

  return row ? withParsedSession(row) : null
}
