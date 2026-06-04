import { and, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import {
  encounters,
  type EncounterRow,
  type EncounterStatus,
} from "@/lib/db/schema/encounter"

/**
 * Reads for the `encounters` table. Unlike the character loader there is no
 * "hydrate" step — the `session` jsonb is already the full tracker state; the
 * player-view projection that strips enemy affinities is a separate concern
 * (UNN-322). Nothing here imports another db domain.
 */

/** The raw `encounters` row by id, or `null` when no encounter matches. */
export async function loadEncounterRowById(
  encounterId: string
): Promise<EncounterRow | null> {
  const [row] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)

  return row ?? null
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

  return row ?? null
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
export async function encounterExists(encounterId: string): Promise<boolean> {
  const [row] = await db
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

  return row ?? null
}
