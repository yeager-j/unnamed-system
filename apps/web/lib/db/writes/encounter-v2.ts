import { and, eq, sql } from "drizzle-orm"

import type { StoredSession } from "@workspace/game-v2/encounter"
import { err, ok, type Result } from "@workspace/game/foundation"

import { db, type WriteExecutor } from "@/lib/db/client"
import { encounterExists } from "@/lib/db/queries/load-encounter"
import { encounters } from "@/lib/db/schema/encounter"

import type { EncounterWriteError } from "./encounter"

/**
 * The **v2 session blob write** (UNN-520) — the guarded UPDATE for an encounter
 * whose `session` column holds a v2 {@link StoredSession} (the engine-v2
 * persisted contract) rather than v1's `CombatSession`. The parallel twin of
 * {@link import("./encounter").saveEncounterSession}: same single `version`
 * token, same conditioned-update shape, same `"stale"` / `"encounter-not-found"`
 * disambiguation. It retires v1's alongside the PR11 console cutover (UNN-510).
 *
 * Status flips stay on the shared {@link import("./encounter").setEncounterStatus}
 * — it never touches the blob, so it is shape-agnostic and needs no twin.
 */
export async function saveStoredEncounterSession(
  encounterId: string,
  stored: StoredSession,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, EncounterWriteError>> {
  const updated = await executor
    .update(encounters)
    .set({
      // Transition cast: the column's `$type` names v1's `CombatSession`, but
      // the jsonb physically stores whichever era's blob its encounter was
      // minted under. Widening the column type would force every v1 consumer
      // to narrow, for a twin that retires the v1 shape at cutover (UNN-510/
      // 511) — so the era is decided here, at the one v2 write boundary.
      session: stored as unknown as typeof encounters.$inferInsert.session,
      version: sql`${encounters.version} + 1`,
    })
    .where(
      and(
        eq(encounters.id, encounterId),
        eq(encounters.version, expectedVersion)
      )
    )
    .returning({ version: encounters.version })

  if (updated.length === 0) {
    return (await encounterExists(encounterId, executor))
      ? err("stale")
      : err("encounter-not-found")
  }

  return ok({ version: updated[0]!.version })
}
