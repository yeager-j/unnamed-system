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

import { mapInstances } from "./map-instance"

/** Ordered-producer ledger for one Map Instance Replica client. */
export const mapInstanceReplicaClient = pgTable(
  "mapInstanceReplicaClient",
  {
    clientGroupId: text("clientGroupId").notNull(),
    clientId: text("clientId").notNull(),
    mapInstanceId: text("mapInstanceId")
      .notNull()
      .references(() => mapInstances.id, { onDelete: "cascade" }),
    lastMutationId: integer("lastMutationId").notNull(),
    lastOutcome: jsonb("lastOutcome").$type<RecordedOutcome<void, unknown>>(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (client) => [
    primaryKey({ columns: [client.clientGroupId, client.clientId] }),
    index("mapInstanceReplicaClient_instance_updated_idx").on(
      client.mapInstanceId,
      client.updatedAt
    ),
  ]
)

export type MapInstanceReplicaClientRow =
  typeof mapInstanceReplicaClient.$inferSelect
