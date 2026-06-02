import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { encounters, type EncounterRow } from "@/lib/db/schema/encounter"

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
