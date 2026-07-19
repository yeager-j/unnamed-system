import type { PgColumn } from "drizzle-orm/pg-core"

import type { MutationInvocation, MutationRegistry } from "@workspace/replica"
import {
  createMutationProcessor,
  type MutationProcessor,
  type ProcessorEvent,
} from "@workspace/replica/server"
import type { Result } from "@workspace/result"

import { db, type WriteExecutor } from "@/lib/db/client"

import {
  createDrizzleMutationDedupAdapter,
  type MutationLedgerTable,
} from "./drizzle-ledger"

/**
 * Showtime's Drizzle adapter for Replica's authority processor. Domain
 * bindings supply their vocabulary and transaction body; this module owns the
 * shared database transaction and pinned-ledger composition.
 */
export function createDrizzleMutationProcessor<
  State,
  Invocation extends MutationInvocation,
  Context,
  Error,
  Remote,
  Table extends MutationLedgerTable,
>(options: {
  readonly mutations: MutationRegistry<State, Invocation, Error>
  readonly ledger: {
    readonly table: Table
    readonly pinColumn: PgColumn
    readonly pinValue: string
  }
  execute(
    tx: WriteExecutor,
    invocation: Invocation,
    context: Context
  ): Promise<Result<Remote, Error>>
  readonly onEvent?: (event: ProcessorEvent) => void
}): MutationProcessor<Context, Error, Remote> {
  return createMutationProcessor({
    mutations: options.mutations,
    transact: (work) => db.transaction(work),
    dedup: createDrizzleMutationDedupAdapter<Remote, Error, Table>({
      table: options.ledger.table,
      pinColumn: options.ledger.pinColumn,
      pinValue: options.ledger.pinValue,
    }),
    execute: options.execute,
    onEvent: options.onEvent,
  })
}
