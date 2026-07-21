import "server-only"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import { createNextMutationExecutor } from "@workspace/headcanon/next/server"

import { entityProtocol } from "@/domain/entity/commit/protocol"
import { getDb } from "@/lib/db/client"

import { executeEntityWrite } from "./execute-entity-write"
import { executeIdentityWrite } from "./execute-identity-write"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "./invalidations"
import { parseEntityMutationRejection } from "./rejection"
import type { EntityMutationActor } from "./types"

/**
 * The Headcanon entity mutation executor (UNN-673/UNN-675) — the authoritative
 * half of every registered entity mutation: `entity.write` (engine components)
 * and `entity.identity` (the app-owned identity columns). Both land on the same
 * receipt ledger and the same axis namespace, so an identity write cannot advance
 * `entity/{id}/identity` without expiring its cache tag and publishing its
 * invalidation. It admits and re-parses the envelope, dedupes by
 * `(actor scope, mutation id)` through the Drizzle receipt ledger, runs the
 * transactional handler with bounded contention retry, and on acceptance expires
 * each stamped axis's cache tag, refreshes the route, and publishes one axis
 * invalidation per stamped axis.
 *
 * `getDb()` (the interactive WebSocket Pool client), not the auto-resolving `db`
 * Proxy, so the adapter's `db.transaction(...)` / savepoint path binds to a real
 * `PgDatabase`. The actor scope keys receipts by the trusted user id.
 */
export const executeEntityMutation = createNextMutationExecutor({
  protocol: entityProtocol,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: EntityMutationActor) => actor.userId,
    parseRejection: parseEntityMutationRejection,
  }),
  handlers: {
    "entity.write": executeEntityWrite,
    "entity.identity": executeIdentityWrite,
  },
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})
