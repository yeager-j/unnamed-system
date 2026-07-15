import { and, eq, sql } from "drizzle-orm"
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { db, type WriteExecutor } from "@/lib/db/client"

/**
 * The single-`version`-token optimistic-concurrency guard, shared by every
 * non-character aggregate that carries one `version` column (encounter, map,
 * map-instance, dungeon). Each of those hand-wrote the identical
 * conditioned-`UPDATE` + atomic bump + zero-row disambiguation; this is the one
 * home for that shape (UNN-597).
 *
 * The entity row's guard is a deliberate **peer, not a caller**
 * ({@link import("../../actions/entity/version-guard").bumpEntityVersionGuarded}):
 * it bumps one of *four* per-write-class tokens, returns the row's `shortId` for
 * a realtime ping, and is character-table-coupled — a different cardinality, not
 * this single-token shape.
 */

export type GuardedUpdateError = "not-found" | "stale"

/** A table this guard can drive: keyed by `id`, versioned by a single `version`. */
type VersionGuardedTable = PgTable & { id: PgColumn; version: PgColumn }

/**
 * Applies `patch` together with the `version + 1` increment in one `SET`,
 * conditioned on `(id, version === expectedVersion)`, and returns the bumped
 * version. On zero affected rows it disambiguates `"stale"` (row exists, token
 * moved) from `"not-found"` (row gone) via an existence SELECT on the same
 * `executor`, so the check shares the caller's transaction snapshot.
 *
 * Callers map the generic `"not-found"` to their aggregate's own error string.
 * `executor` defaults to the base `db`; pass a transaction handle to compose
 * inside a {@link import("./guard-many").guardMany}.
 */
export async function guardedVersionUpdate<
  T extends VersionGuardedTable,
>(params: {
  table: T
  id: string
  expectedVersion: number
  patch: PgUpdateSetSource<T>
  executor?: WriteExecutor
}): Promise<Result<{ version: number }, GuardedUpdateError>> {
  const { table, id, expectedVersion, patch, executor = db } = params

  const updated = await executor
    .update(table)
    .set({ ...patch, version: sql`${table.version} + 1` })
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning({ version: table.version })

  if (updated.length === 0) {
    const [row] = await executor
      .select({ id: table.id })
      .from(table as PgTable)
      .where(eq(table.id, id))
      .limit(1)
    return row ? err("stale") : err("not-found")
  }

  return ok({ version: updated[0]!.version as number })
}
