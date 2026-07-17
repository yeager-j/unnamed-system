import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type { MapGeometry } from "@workspace/game-v2/spatial"

import { users } from "./user"

/**
 * A **Map** is a reusable, **user-owned** authored dungeon template — geography
 * that belongs to no campaign or dungeon (Dungeon Map ADR, *The four-entity
 * model*). Selecting one mints a {@link import("./map-instance").mapInstances}
 * snapshot that owns the live spatial runtime; the template itself holds no
 * runtime. Its whole authored {@link MapGeometry} (Zones, connections +
 * `hidden`/`locked`, node `(x,y)`, descriptions + DM notes) persists as one
 * `geometry` jsonb blob, guarded by a single `version` token — the same
 * optimistic-concurrency shape as the encounter `session` and the Instance
 * `state`.
 *
 * `shortId` backs the owner-only My Maps editor URL (`/stage/maps/{shortId}`). Writes
 * gate on the owner (`requireMapOwner`, `map.userId === viewer`); the snapshot
 * isolates the template from any minted Instance, so editing a Map never reaches
 * a live Instance (the `mapInstance.mapId` FK is `set null`, so a Map can be
 * deleted out from under its snapshots).
 */
export const maps = pgTable("map", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  geometry: jsonb("geometry").$type<MapGeometry>().notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type MapRow = typeof maps.$inferSelect
