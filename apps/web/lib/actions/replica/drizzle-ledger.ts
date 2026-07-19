import { and, eq, lt } from "drizzle-orm"
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core"

import {
  type MutationDedupAdapter,
  type MutationId,
  type RecordedOutcome,
} from "@workspace/replica/server"

import type { WriteExecutor } from "@/lib/db/client"

/**
 * Dedup rows idle past this window are swept opportunistically inside the
 * processor's transaction. Bootstrap reads refresh active identities, so the
 * sweep targets abandoned clients while preserving the absent-row means
 * unknown-client invariant.
 */
export const REPLICA_DEDUP_TTL_MS = 30 * 24 * 60 * 60 * 1000

type MutationLedgerTable = PgTable & {
  clientGroupId: PgColumn
  clientId: PgColumn
  lastMutationId: PgColumn
  lastOutcome: PgColumn
  updatedAt: PgColumn
}

/**
 * Drizzle implementation of Replica's dedup adapter for a ledger table pinned
 * to one application root. The table and pin column remain application-owned;
 * the package owns only the storage interface and ordering protocol.
 */
export function createDrizzleMutationDedupAdapter<
  Remote,
  Rejection,
  Table extends MutationLedgerTable,
>(options: {
  readonly table: Table
  readonly pinColumn: PgColumn
  readonly pinValue: string
}): MutationDedupAdapter<WriteExecutor, Remote, Rejection> {
  const { table, pinColumn, pinValue } = options

  return {
    async acquire(tx, client) {
      const [row] = await tx
        .select({
          pin: pinColumn,
          lastMutationId: table.lastMutationId,
          lastOutcome: table.lastOutcome,
        })
        .from(table as PgTable)
        .where(
          and(
            eq(table.clientGroupId, client.clientGroupId),
            eq(table.clientId, client.clientId)
          )
        )
        .for("update")
      if (!row) return null
      if (row.pin !== pinValue) {
        throw new Error(
          `replica client ${client.clientGroupId}/${client.clientId} is pinned to another root`
        )
      }
      return {
        lastMutationId: row.lastMutationId as MutationId,
        // Written exclusively by `record` below under the same schema; the
        // stored shape is this door's recorded outcome, not foreign input.
        lastOutcome: (row.lastOutcome ?? undefined) as
          | RecordedOutcome<Remote, Rejection>
          | undefined,
      }
    },

    async record(tx, client, mutationId, outcome) {
      await tx
        .update(table)
        .set({
          lastMutationId: mutationId,
          lastOutcome: outcome,
          updatedAt: new Date(),
        } as PgUpdateSetSource<Table>)
        .where(
          and(
            eq(table.clientGroupId, client.clientGroupId),
            eq(table.clientId, client.clientId)
          )
        )

      await tx
        .delete(table)
        .where(
          and(
            eq(pinColumn, pinValue),
            lt(table.updatedAt, new Date(Date.now() - REPLICA_DEDUP_TTL_MS))
          )
        )
    },
  }
}
