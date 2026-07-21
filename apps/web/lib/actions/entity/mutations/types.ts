import type { DrizzleHandlerTx } from "@workspace/headcanon/drizzle"

import type { EntityWriteRefusal } from "@/domain/entity/commit/writers"
import type { getDb } from "@/lib/db/client"

/**
 * Shared types for the Headcanon `entity.write` authority (UNN-673), kept in a
 * leaf module so the handler and the executor agree on the transaction, actor,
 * and rejection shapes without a circular import.
 */

/**
 * The Drizzle transaction a mutation handler runs inside, derived from the
 * interactive `getDb()` client so it matches
 * `createDrizzleMutationAuthority({ db: getDb() })` structurally.
 */
export type EntityMutationTx = DrizzleHandlerTx<ReturnType<typeof getDb>>

/** The trusted actor an entity mutation executes as — authentication only; the
 *  door owns per-entity authorization (UNN-673 AC #5). */
export interface EntityMutationActor {
  readonly userId: string
}

/**
 * A terminal domain refusal for `entity.write`. The Writer refusals plus the two
 * authority-load outcomes; **contention is not here** — a lost guarded write
 * calls `throwMutationContention()` so the executor retries against fresh state,
 * it is never a terminal rejection.
 */
export type EntityMutationRejection =
  | EntityWriteRefusal
  | "entity-not-found"
  | "entity-load-failed"
