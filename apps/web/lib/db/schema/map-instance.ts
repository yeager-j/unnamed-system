import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"

import {
  mapInstanceStateSchema,
  type MapInstanceState,
} from "@workspace/game/foundation"

import { maps } from "./map"

/**
 * A **Map Instance** is the per-run spatial truth the Dungeon Map feature layers
 * combat and exploration over (Dungeon Map ADR, *Persistence & concurrency*).
 * Its whole spatial state — the {@link MapInstanceState} the pure
 * `reduceMapInstance` will operate over — persists as one `state` jsonb blob,
 * mirroring how an encounter stores its `session`; a single `version` token
 * guards every write.
 *
 * `mapId` is a **nullable** fk → {@link maps} with `onDelete: "set null"`: an
 * Instance is a **snapshot** that must survive its template's deletion (the
 * isolation premise — Dungeon Map ADR, *FK lifecycle*), so deleting a Map nulls
 * the back-reference rather than cascading. A template-less Instance (`mapId`
 * null) is authored ad hoc in encounter setup (the M0 case); Map authoring
 * (UNN-460) added the `maps` table + this FK. An Instance has no `shortId` of its
 * own — it is reached only through the Encounter (or, later, Dungeon) that
 * references it.
 */
export const mapInstances = pgTable("mapInstance", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  mapId: text("mapId").references(() => maps.id, { onDelete: "set null" }),
  state: jsonb("state").$type<MapInstanceState>().notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const insertMapInstanceSchema = createInsertSchema(mapInstances, {
  state: mapInstanceStateSchema,
})
export const selectMapInstanceSchema = createSelectSchema(mapInstances)

export type MapInstanceRow = typeof mapInstances.$inferSelect
