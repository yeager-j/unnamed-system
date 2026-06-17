import { and, eq, sql } from "drizzle-orm"

import {
  err,
  ok,
  type CombatSession,
  type Result,
} from "@workspace/game/foundation"

import { db, type WriteExecutor } from "@/lib/db/client"
import { encounterExists } from "@/lib/db/queries/load-encounter"
import { encounters, type EncounterStatus } from "@/lib/db/schema/encounter"
import { insertWithShortId } from "@/lib/db/short-id"

/**
 * Persistence for an encounter and its serialized {@link CombatSession}
 * (ADR Decision 3). The DM is the sole writer, so a single `version` token
 * guards every mutation: each guarded write bumps `version` while conditioning
 * on `(id, version === expectedVersion)`, and on zero affected rows
 * disambiguates `"stale"` from `"encounter-not-found"`.
 *
 * This is pure persistence — the DM authorization (`requireCampaignDM`) lives at
 * the Server Action boundary that calls these, exactly as the character writes
 * stay auth-free behind `requireOwner`. We deliberately do not fold this into
 * the character `version-guard` primitive: that one is per-class and
 * character-table-coupled, whereas the encounter has a single version column —
 * a simpler guard whose only shared trait is the conditioned-update *shape*.
 */

export type EncounterWriteError = "encounter-not-found" | "stale"

/**
 * Inserts a fresh `draft` encounter (version 0) for `campaignId` with a minted,
 * collision-retried `shortId`, and returns its `id` + `shortId`. The combatant
 * roster is whatever the caller built (UNN-298/300/301); this layer just
 * persists the assembled session. `mapInstanceId` references the Instance the
 * create action mints in the same transaction (UNN-459 — the column is non-null,
 * so every encounter is born with its spatial truth); pass the same `executor`
 * so the two inserts share one snapshot.
 */
export async function createEncounter(
  input: {
    campaignId: string
    name: string
    notes?: string | null
    session: CombatSession
    mapInstanceId: string
  },
  executor: WriteExecutor = db
): Promise<{ id: string; shortId: string }> {
  return insertWithShortId(async (shortId) => {
    const [row] = await executor
      .insert(encounters)
      .values({
        campaignId: input.campaignId,
        name: input.name,
        notes: input.notes ?? null,
        shortId,
        session: input.session,
        mapInstanceId: input.mapInstanceId,
      })
      .returning({ id: encounters.id, shortId: encounters.shortId })

    return row!
  })
}

/**
 * The core guarded write the impure shell (UNN-332) calls after reducing an
 * event: replaces the whole `session` blob and bumps `version`, conditioned on
 * the caller's `expectedVersion`. Returns the new version on success.
 */
export async function saveEncounterSession(
  encounterId: string,
  session: CombatSession,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, EncounterWriteError>> {
  return bumpEncounterVersionGuarded(executor, encounterId, expectedVersion, {
    session,
  })
}

/**
 * Transitions an encounter's lifecycle `status` (`draft` → `live` → `ended`),
 * version-guarded like every other session write so a status flip can't race a
 * concurrent edit. The single-live-encounter-per-campaign rule that sits on top
 * of this is enforced app-side in UNN-302.
 */
export async function setEncounterStatus(
  encounterId: string,
  status: EncounterStatus,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, EncounterWriteError>> {
  return bumpEncounterVersionGuarded(executor, encounterId, expectedVersion, {
    status,
  })
}

/**
 * Runs a guarded single-version bump: applies `patch` together with the
 * `version + 1` increment in one `SET`, conditioned on `(id, version ===
 * expectedVersion)`, and returns the bumped version. On zero affected rows it
 * disambiguates `"stale"` (row exists, token moved) from `"encounter-not-found"`
 * (row gone) via {@link encounterExists}.
 */
async function bumpEncounterVersionGuarded(
  executor: WriteExecutor,
  encounterId: string,
  expectedVersion: number,
  patch: Partial<typeof encounters.$inferInsert>
): Promise<Result<{ version: number }, EncounterWriteError>> {
  const updated = await executor
    .update(encounters)
    .set({ ...patch, version: sql`${encounters.version} + 1` })
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
