import type { StoredSession } from "@workspace/game-v2/encounter"
import { type Result } from "@workspace/game-v2/kernel/result"

import { db, type WriteExecutor } from "@/lib/db/client"
import { encounters, type EncounterStatus } from "@/lib/db/schema/encounter"
import { insertWithShortId } from "@/lib/db/short-id"
import { guardedVersionUpdate } from "@/lib/db/writes/guarded-update"

/**
 * Persistence for an encounter and its serialized {@link StoredSession} — the
 * engine-v2 persisted contract (ADR Decision 3; UNN-535 hard cutover). The DM
 * is the sole writer, so a single `version` token guards every mutation through
 * the shared {@link guardedVersionUpdate}.
 *
 * This is pure persistence — the DM authorization (`requireCampaignDM`) lives at
 * the Server Action boundary that calls these, exactly as the character writes
 * stay auth-free behind `requireOwner`.
 */

export type EncounterWriteError = "encounter-not-found" | "stale"

/**
 * Inserts a fresh encounter (version 0) for `campaignId` with a minted,
 * collision-retried `shortId`, and returns its `id` + `shortId`. The combatant
 * roster is whatever the caller built (UNN-298/300/301); this layer just
 * persists the assembled session. `mapInstanceId` references the Instance the
 * create action mints in the same transaction (UNN-459 — the column is non-null,
 * so every encounter is born with its spatial truth); pass the same `executor`
 * so the two inserts share one snapshot.
 *
 * `status` defaults to `draft` — the encounter-setup flow's starting state. The
 * **dungeon** combat path (UNN-467) passes `"live"` to insert an
 * already-running encounter on the delve's shared Instance: it has no setup step
 * of its own (combatants are staged client-side and committed at "Begin"), so
 * there is no `draft` to flip from, and creating-already-live keeps the gesture a
 * single atomic write.
 */
export async function createEncounter(
  input: {
    campaignId: string
    name: string
    notes?: string | null
    session: StoredSession
    mapInstanceId: string
    status?: EncounterStatus
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
        status: input.status ?? "draft",
      })
      .returning({ id: encounters.id, shortId: encounters.shortId })

    return row!
  })
}

/**
 * The core guarded write the impure shell calls after reducing an event:
 * replaces the whole `session` blob (the fail-closed `saveSession` serializer's
 * {@link StoredSession} output) and bumps `version`, conditioned on the
 * caller's `expectedVersion`. Returns the new version on success. The hard
 * cutover (UNN-535) retired the v1 blob shape and folded its writer back here.
 */
export async function saveEncounterSession(
  encounterId: string,
  session: StoredSession,
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

/** The shared single-version guard, bound to this aggregate's table + error. */
async function bumpEncounterVersionGuarded(
  executor: WriteExecutor,
  encounterId: string,
  expectedVersion: number,
  patch: Partial<typeof encounters.$inferInsert>
): Promise<Result<{ version: number }, EncounterWriteError>> {
  return guardedVersionUpdate({
    table: encounters,
    id: encounterId,
    expectedVersion,
    patch,
    notFound: "encounter-not-found",
    executor,
  })
}
