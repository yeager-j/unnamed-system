import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type { MapInstanceState } from "@workspace/game-v2/spatial"

import { maps } from "./map"

export type MapInstanceStatus = "open" | "frozen"

/**
 * A **Map Instance** is the per-run spatial truth the Dungeon Map feature layers
 * combat and exploration over (Dungeon Map ADR, *Persistence & concurrency*).
 * Its whole spatial state — the {@link MapInstanceState} the pure
 * `reduceMapInstance` will operate over — persists as one `state` jsonb blob,
 * mirroring how an encounter stores its `session`. `status` is the aggregate's
 * own write license: `open` accepts Replica and cross-root intent; `frozen`
 * rejects every later mutation regardless of which parent route still exists.
 * `version` is the accepted-state cursor served to Replica clients.
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
  status: text("status").$type<MapInstanceStatus>().notNull().default("open"),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type MapInstanceRow = typeof mapInstances.$inferSelect
