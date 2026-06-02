import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { encounters, type EncounterRow } from "@/lib/db/schema/encounter"

/**
 * Reads for the `encounters` table, plus the executor type its guarded writes
 * share. Unlike the character loader there is no "hydrate" step — the `session`
 * jsonb is already the full tracker state; the player-view projection that
 * strips enemy affinities is a separate concern (UNN-322). Nothing here imports
 * another db domain.
 */

/**
 * Either the auto-resolving {@link db} client or the transaction handle passed
 * to a `db.transaction` callback. The guarded encounter writes accept this so
 * their existence read shares the caller's snapshot rather than escaping to a
 * separate connection — mirrors `CharacterWriteExecutor`.
 */
export type EncounterWriteExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0]

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
export async function encounterExists(
  encounterId: string,
  executor: EncounterWriteExecutor = db
): Promise<boolean> {
  const [row] = await executor
    .select({ id: encounters.id })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)

  return row !== undefined
}
