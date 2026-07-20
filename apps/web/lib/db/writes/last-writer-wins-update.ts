import { eq, sql } from "drizzle-orm"
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core"

import { err, ok, type Result } from "@workspace/result"

import { db } from "@/lib/db/client"

type VersionedTable = PgTable & { id: PgColumn; version: PgColumn }

/**
 * Applies one field-scoped patch and advances the row revision atomically.
 * Concurrent writers intentionally resolve in database update order; callers
 * must use this only when last-writer-wins is the aggregate's chosen policy.
 */
export async function lastWriterWinsUpdate<
  T extends VersionedTable,
  ENotFound extends string,
>(params: {
  table: T
  id: string
  patch: PgUpdateSetSource<T>
  notFound: ENotFound
}): Promise<Result<void, ENotFound>> {
  const { table, id, patch, notFound } = params
  const updated = await db
    .update(table)
    .set({ ...patch, version: sql`${table.version} + 1` })
    .where(eq(table.id, id))
    .returning({ id: table.id })

  return updated.length === 0 ? err(notFound) : ok(undefined)
}
