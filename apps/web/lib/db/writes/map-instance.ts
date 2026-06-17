import { and, eq, sql } from "drizzle-orm"

import {
  err,
  ok,
  type MapInstanceState,
  type Result,
} from "@workspace/game/foundation"

import { type WriteExecutor } from "@/lib/db/client"
import { mapInstances } from "@/lib/db/schema/map-instance"

/**
 * Persistence for a Map Instance and its serialized {@link MapInstanceState}
 * (Dungeon Map ADR — *Persistence & concurrency*). A single `version` token
 * guards every mutation, mirroring the encounter write
 * ({@link import("./encounter").saveEncounterSession}): each guarded write bumps
 * `version` while conditioning on `(id, version === expectedVersion)`, and on
 * zero affected rows disambiguates `"stale"` from `"map-instance-not-found"`.
 *
 * Like the encounter guard, this is **not** folded into the character
 * `version-guard` primitive (that one is per-class and character-table-coupled);
 * the only shared trait is the conditioned-update *shape*. Every write takes a
 * {@link WriteExecutor} so it can run standalone **or** inside a
 * {@link import("./guard-many").guardMany} transaction that composes it with an
 * encounter/dungeon write (the few genuinely-atomic gestures — ADR *Atomicity*).
 *
 * No realtime ping fires here: a Map Instance has no channel of its own (it is
 * reached through its Encounter/Dungeon), and the version-kind ping tag is a
 * later concern (UNN-468). Authorization (`requireCampaignDM`) lives at the
 * Server Action boundary, as with the other writes.
 */

export type MapInstanceWriteError = "map-instance-not-found" | "stale"

/**
 * Inserts a fresh Map Instance at `version: 0` with the caller-minted `id` and
 * serialized `state`. The caller mints the id so it can reference the new
 * Instance (`encounter.mapInstanceId`) inside the same transaction. Runs on the
 * supplied `executor` so a `guardMany` caller composes it with the encounter
 * insert; the encounter-create action mints an empty Instance this way (every
 * draft gets a write target before setup authors its geometry).
 */
export async function insertMapInstance(
  executor: WriteExecutor,
  id: string,
  state: MapInstanceState
): Promise<void> {
  await executor.insert(mapInstances).values({ id, state })
}

/**
 * The core guarded write: replaces the whole `state` blob and bumps `version`,
 * conditioned on the caller's `expectedVersion`. Returns the new version on
 * success. Runs on the supplied `executor` so an in-transaction caller writes
 * against its own snapshot.
 */
export async function saveMapInstanceState(
  executor: WriteExecutor,
  mapInstanceId: string,
  state: MapInstanceState,
  expectedVersion: number
): Promise<Result<{ version: number }, MapInstanceWriteError>> {
  return bumpMapInstanceVersionGuarded(
    executor,
    mapInstanceId,
    expectedVersion,
    {
      state,
    }
  )
}

/**
 * Runs a guarded single-version bump: applies `patch` together with the
 * `version + 1` increment in one `SET`, conditioned on `(id, version ===
 * expectedVersion)`, and returns the bumped version. On zero affected rows it
 * disambiguates `"stale"` (row exists, token moved) from
 * `"map-instance-not-found"` (row gone) via {@link mapInstanceExists}, run on the
 * same executor so the check shares the caller's transaction snapshot.
 */
async function bumpMapInstanceVersionGuarded(
  executor: WriteExecutor,
  mapInstanceId: string,
  expectedVersion: number,
  patch: Partial<typeof mapInstances.$inferInsert>
): Promise<Result<{ version: number }, MapInstanceWriteError>> {
  const updated = await executor
    .update(mapInstances)
    .set({ ...patch, version: sql`${mapInstances.version} + 1` })
    .where(
      and(
        eq(mapInstances.id, mapInstanceId),
        eq(mapInstances.version, expectedVersion)
      )
    )
    .returning({ version: mapInstances.version })

  if (updated.length === 0) {
    return (await mapInstanceExists(executor, mapInstanceId))
      ? err("stale")
      : err("map-instance-not-found")
  }

  return ok({ version: updated[0]!.version })
}

/** Existence check for the zero-row disambiguation, on the caller's executor. */
async function mapInstanceExists(
  executor: WriteExecutor,
  mapInstanceId: string
): Promise<boolean> {
  const [row] = await executor
    .select({ id: mapInstances.id })
    .from(mapInstances)
    .where(eq(mapInstances.id, mapInstanceId))
    .limit(1)

  return row !== undefined
}
