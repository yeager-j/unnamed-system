import type { DrizzleHandlerTx } from "@workspace/headcanon/drizzle"

import type { EntityFinalizeRefusal } from "@/domain/entity/commit/protocol"
import type { EntityWriteRefusal } from "@/domain/entity/commit/writers"
import type { Actor } from "@/lib/auth/actor"
import type { getDb } from "@/lib/db/client"

import type { EntityWriteAuthRejection } from "../authorize-write"
import type { IdentityWriteRejection } from "../identity-store"

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

/** The trusted actor an entity mutation executes as — authentication only, the
 *  same {@link Actor} the door derives from the session. Per-entity authorization
 *  is a decision the handler makes with it inside the transaction (UNN-674). */
export type EntityMutationActor = Actor

/**
 * A terminal domain refusal for any registered entity mutation — the union both
 * handlers return, because the receipt ledger stores one rejection type per
 * protocol. `entity.write` contributes the Writer refusals, the two
 * authority-load outcomes, and the contextual authorization refusals the handler
 * returns inside the transaction (UNN-674 — the doors translate these to
 * `forbidden()`); `entity.identity` contributes its narrower set (UNN-675).
 * **Contention is not here** — a lost guarded write calls
 * `throwMutationContention()` so the executor retries against fresh state, it is
 * never a terminal rejection.
 *
 * Every member stays a string literal so `rejection.ts` can validate a stored
 * receipt without reconstructing domain objects.
 */
export type EntityMutationRejection =
  | EntityWriteRefusal
  | EntityFinalizeRefusal
  | "entity-not-found"
  | "entity-load-failed"
  | "entity-not-draft"
  | EntityWriteAuthRejection
  | IdentityWriteRejection
