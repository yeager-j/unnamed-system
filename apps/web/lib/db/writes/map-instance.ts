import { err, type Result } from "@workspace/game-v2/kernel/result"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import { type WriteExecutor } from "@/lib/db/client"
import { mapInstances } from "@/lib/db/schema/map-instance"
import { guardedVersionUpdate } from "@/lib/db/writes/guarded-update"

/**
 * Persistence for a Map Instance and its serialized {@link MapInstanceState}
 * (Dungeon Map ADR — *Persistence & concurrency*). A single `version` token
 * guards every mutation through the shared {@link guardedVersionUpdate}. Every
 * write takes a {@link WriteExecutor} so it can run standalone **or** inside a
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
 *
 * `mapId` records the **source Map** the Instance snapshots — set when a delve
 * (or, later, a standalone encounter) is built by selecting a Map (UNN-465), left
 * `undefined` for an ad-hoc Instance authored in encounter setup. The fk is
 * `set null`, so the Instance survives its template's deletion (the snapshot
 * isolation premise). The geometry snapshot itself rides the `state` blob and is
 * deferred to UNN-464; recording `mapId` here is the durable link.
 */
export async function insertMapInstance(
  executor: WriteExecutor,
  id: string,
  state: MapInstanceState,
  mapId?: string
): Promise<void> {
  await executor.insert(mapInstances).values({ id, state, mapId })
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
 * The shared single-version guard, with the generic `"not-found"` mapped to this
 * aggregate's `"map-instance-not-found"`.
 */
async function bumpMapInstanceVersionGuarded(
  executor: WriteExecutor,
  mapInstanceId: string,
  expectedVersion: number,
  patch: Partial<typeof mapInstances.$inferInsert>
): Promise<Result<{ version: number }, MapInstanceWriteError>> {
  const result = await guardedVersionUpdate({
    table: mapInstances,
    id: mapInstanceId,
    expectedVersion,
    patch,
    executor,
  })
  if (!result.ok) {
    return err(
      result.error === "not-found" ? "map-instance-not-found" : "stale"
    )
  }
  return result
}
