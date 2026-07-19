import { and, eq, sql } from "drizzle-orm"

import {
  mapInstanceStateSchema,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { type WriteExecutor } from "@/lib/db/client"
import { mapInstances, type MapInstanceRow } from "@/lib/db/schema/map-instance"

/**
 * Persistence for a Map Instance and its serialized {@link MapInstanceState}
 * (Dungeon Map ADR — *Persistence & concurrency*). Writers lock the aggregate,
 * reduce from its current state, and bump the cursor in the same transaction.
 * Cross-root commands use the same lock before composing encounter or dungeon
 * changes, so callers never coordinate a second client-side version token.
 *
 * No realtime ping fires here: a Map Instance has no channel of its own (it is
 * reached through its Encounter/Dungeon), and the version-kind ping tag is a
 * later concern (UNN-468). Authorization (`requireCampaignDM`) lives at the
 * Server Action boundary, as with the other writes.
 */

export type MapInstanceWriteError =
  | "map-instance-not-found"
  | "map-instance-frozen"
  | "invalid-state"

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

export async function loadMapInstanceForWriteLocked(
  executor: WriteExecutor,
  mapInstanceId: string
): Promise<Result<MapInstanceRow, MapInstanceWriteError>> {
  const [row] = await executor
    .select()
    .from(mapInstances)
    .where(eq(mapInstances.id, mapInstanceId))
    .for("update")
  if (!row) return err("map-instance-not-found")
  if (row.status !== "open") return err("map-instance-frozen")
  const state = mapInstanceStateSchema.safeParse(row.state)
  if (!state.success) return err("invalid-state")
  return ok({ ...row, state: state.data })
}

/** Commits against a row locked by {@link loadMapInstanceForWriteLocked}.
 * `freeze` is the terminal aggregate transition and shares the state write's
 * single bump, making lifecycle and spatial history indivisible. */
export async function saveLockedMapInstanceState(
  executor: WriteExecutor,
  row: MapInstanceRow,
  state: MapInstanceState,
  options: { freeze?: boolean } = {}
): Promise<Result<{ version: number }, MapInstanceWriteError>> {
  const [updated] = await executor
    .update(mapInstances)
    .set({
      state,
      ...(options.freeze ? { status: "frozen" as const } : {}),
      version: sql`${mapInstances.version} + 1`,
    })
    .where(
      and(
        eq(mapInstances.id, row.id),
        eq(mapInstances.version, row.version),
        eq(mapInstances.status, "open")
      )
    )
    .returning({ version: mapInstances.version })
  return updated ? ok({ version: updated.version }) : err("map-instance-frozen")
}
