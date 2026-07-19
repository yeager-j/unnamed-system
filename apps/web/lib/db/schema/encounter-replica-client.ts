import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

import type { RecordedOutcome } from "@workspace/replica/server"

import { encounters } from "./encounter"

/**
 * The per-client mutation dedup ledger for the **inline combat replica**
 * (UNN-646) — the encounter-scoped sibling of `replicaClient` (see that
 * table's doc for the ledger semantics: one row per ordered producer,
 * last-outcome-only retention, bootstrap-minted rows, `(group, id)` PK
 * because the protocol envelope carries no scope id).
 *
 * A **sibling table** rather than a widened `replicaClient` deliberately: the
 * inline root has no `entity` row to pin, and a nullable/polymorphic scope FK
 * would trade honest cascade semantics and a clean rollback (drop table) for
 * a runtime CHECK. Two roots with different authority scopes get two honest
 * ledgers. Dropping ledger rows is protocol-safe by construction — a client
 * whose row vanishes is refused `unknown-client` and rebuilds under a fresh
 * identity (the TTL sweep exercises the same recovery).
 *
 * Unlike `replicaClient` (`Remote = void`), `lastOutcome` here records the
 * session door's `Remote = { version }` — the encounter version the commit
 * produced, reproduced verbatim on a deduplicated redelivery (never
 * recomputed from newer state).
 *
 * **Lock order: `encounterReplicaClient` → `encounters`.** No transaction
 * takes an encounter lock and then a ledger lock — except Postgres itself
 * during a cascade delete of an encounter, which locks parent-first; that
 * inversion can only deadlock against an in-flight push, whose abort surfaces
 * as a thrown (ambiguous, retryable) delivery — the protocol's existing
 * recovery.
 */
export const encounterReplicaClient = pgTable(
  "encounterReplicaClient",
  {
    clientGroupId: text("clientGroupId").notNull(),
    clientId: text("clientId").notNull(),
    encounterId: text("encounterId")
      .notNull()
      .references(() => encounters.id, { onDelete: "cascade" }),
    lastMutationId: integer("lastMutationId").notNull(),
    lastOutcome:
      jsonb("lastOutcome").$type<
        RecordedOutcome<{ version: number }, unknown>
      >(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (client) => [
    primaryKey({ columns: [client.clientGroupId, client.clientId] }),
    index("encounterReplicaClient_encounter_updated_idx").on(
      client.encounterId,
      client.updatedAt
    ),
  ]
)

/** The persisted dedup row shape (typed off the table). */
export type EncounterReplicaClientRow =
  typeof encounterReplicaClient.$inferSelect
