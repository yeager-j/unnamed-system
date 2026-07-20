import { and, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { encounters, type EncounterStatus } from "@/lib/db/schema/encounter"
import { mapInstances } from "@/lib/db/schema/map-instance"

/**
 * **Blob-free** reads for the `encounters` table (UNN-535): every function here
 * selects columns only, never the `session` jsonb — the parse-and-dissolve
 * reads live in `load-encounter-session.ts` (the F6 boundary). Keeping this module
 * blob-agnostic is what let the campaign surfaces and version plumbing survive
 * the v1→v2 cutover untouched.
 */

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
 * The encounter's Map-Instance `version` only (by the encounter's public
 * `shortId`), or `null` when no encounter matches. The Instance-queue twin of
 * {@link loadEncounterVersionByShortId} (UNN-535): the console's spatial write
 * queue refetches this on a genuine cross-writer `"stale"` and retries once.
 * A column-only join — the Instance `state` blob is never read.
 */
export async function loadInstanceVersionByEncounterShortId(
  shortId: string
): Promise<number | null> {
  const [row] = await db
    .select({ version: mapInstances.version })
    .from(encounters)
    .innerJoin(mapInstances, eq(mapInstances.id, encounters.mapInstanceId))
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

/** The blob-free routing/auth envelope of one encounter (UNN-646): what the
 *  combat replica doors need before — and without — touching `session`. */
export interface EncounterEnvelope {
  id: string
  shortId: string
  campaignId: string
  status: EncounterStatus
  mapInstanceId: string
}

/**
 * The encounter row's version paired with its Instance's — the idempotent
 * command no-op's answer (UNN-657): an already-terminal encounter reports
 * current versions from an unlocked read (both `ended` and frozen never
 * revert), publishing nothing.
 */
export async function loadEncounterAndInstanceVersions(
  encounterId: string
): Promise<{ version: number; instanceVersion: number } | null> {
  const [row] = await db
    .select({
      version: encounters.version,
      instanceVersion: mapInstances.version,
    })
    .from(encounters)
    .innerJoin(mapInstances, eq(mapInstances.id, encounters.mapInstanceId))
    .where(eq(encounters.id, encounterId))
    .limit(1)
  return row ?? null
}

export async function loadEncounterEnvelopeById(
  encounterId: string
): Promise<EncounterEnvelope | null> {
  const [row] = await db
    .select({
      id: encounters.id,
      shortId: encounters.shortId,
      campaignId: encounters.campaignId,
      status: encounters.status,
      mapInstanceId: encounters.mapInstanceId,
    })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)

  return row ?? null
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
 * {@link loadLiveEncounterSummaryForCampaign}.
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
 * The campaign's single `live` encounter as the lightweight
 * {@link EncounterSummary} projection (no `session` jsonb), or `null` if none
 * is live. Backs the campaign page's live-encounter banner (UNN-329), which
 * renders only the name + link; the single-live *guard* uses the even lighter
 * {@link import("./load-encounter-session").loadLiveEncounterIdForCampaign}.
 */
export async function loadLiveEncounterSummaryForCampaign(
  campaignId: string
): Promise<EncounterSummary | null> {
  const [row] = await db
    .select({
      id: encounters.id,
      shortId: encounters.shortId,
      name: encounters.name,
      status: encounters.status,
      createdAt: encounters.createdAt,
    })
    .from(encounters)
    .where(
      and(eq(encounters.campaignId, campaignId), eq(encounters.status, "live"))
    )
    .limit(1)

  return row ?? null
}
