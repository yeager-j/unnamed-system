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

import { entity } from "./entity"

/**
 * The per-client mutation dedup ledger for the entity replica (UNN-645; design
 * `docs/write-audit/unn-638-replica-module-design.md` §Authority-side
 * processing). One row per ordered producer — identity is minted per
 * (tab × entity), so `clientGroupId` names the entity's replica group and
 * `clientId` one tab's ordered stream within it. The row is the authority's
 * memory of that stream: the incorporation watermark (`lastMutationId`) and
 * the last terminal outcome, which is all serial delivery can ever re-ask for
 * (an older ID's outcome is unreachable while the client redelivers in order),
 * so retention is **last-outcome-only by construction** — `record` overwrites
 * in place.
 *
 * The protocol addresses a row by `(clientGroupId, clientId)` alone (the
 * envelope carries no entity id), hence the composite PK. `entityId` is the
 * honest scoping column beside it: the atomic snapshot read joins through it,
 * a hard entity delete cascades, and the opportunistic TTL sweep prunes
 * abandoned tabs' rows by `(entityId, updatedAt)`.
 *
 * `lastOutcome` stores the processor's recorded outcome verbatim (`Remote =
 * void`, so a success has no payload); the error side is the door's rejection
 * taxonomy, owned and re-parsed by the door on read — the column stays
 * `unknown` rather than importing the door's vocabulary downward.
 */
export const replicaClient = pgTable(
  "replicaClient",
  {
    clientGroupId: text("clientGroupId").notNull(),
    clientId: text("clientId").notNull(),
    entityId: text("entityId")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    lastMutationId: integer("lastMutationId").notNull(),
    lastOutcome: jsonb("lastOutcome").$type<RecordedOutcome<void, unknown>>(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (client) => [
    primaryKey({ columns: [client.clientGroupId, client.clientId] }),
    index("replicaClient_entity_updated_idx").on(
      client.entityId,
      client.updatedAt
    ),
  ]
)

/** The persisted dedup row shape (typed off the table). */
export type ReplicaClientRow = typeof replicaClient.$inferSelect
