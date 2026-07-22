import { and, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { encounters, type EncounterStatus } from "@/lib/db/schema/encounter"

/**
 * **Blob-free** reads for the `encounters` table (UNN-535): every function here
 * selects columns only, never the `session` jsonb — the parse-and-dissolve
 * reads live in `load-encounter-session.ts` (the F6 boundary). Keeping this module
 * blob-agnostic is what let the campaign surfaces and version plumbing survive
 * the v1→v2 cutover untouched.
 */

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

/** Summary row for the manage page's encounter list (UNN-329) — the columns the
 *  list renders, never the heavy `session` blob. */
export interface EncounterSummary {
  id: string
  shortId: string
  name: string
  status: EncounterStatus
  version: number
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
      version: encounters.version,
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
      version: encounters.version,
      createdAt: encounters.createdAt,
    })
    .from(encounters)
    .where(
      and(eq(encounters.campaignId, campaignId), eq(encounters.status, "live"))
    )
    .limit(1)

  return row ?? null
}
