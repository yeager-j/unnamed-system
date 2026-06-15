import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"

import {
  mapInstanceStateSchema,
  type MapInstanceState,
} from "@workspace/game/foundation"

/**
 * A **Map Instance** is the per-run spatial truth the Dungeon Map feature layers
 * combat and exploration over (Dungeon Map ADR, *Persistence & concurrency*).
 * Its whole spatial state — the {@link MapInstanceState} the pure
 * `reduceMapInstance` will operate over — persists as one `state` jsonb blob,
 * mirroring how an encounter stores its `session`; a single `version` token
 * guards every write.
 *
 * **Additive M0 scaffolding (UNN-450)** — nothing references this table yet. The
 * destructive cutover (UNN-459) reseeds it and flips `encounter.mapInstanceId`
 * to non-null. `mapId` is a **nullable column with no FK**: M0 Instances are
 * template-less (`mapId` null), authored ad hoc; the `maps` table and the
 * `mapId → maps` FK constraint arrive with Map authoring (M1). An Instance has
 * no `shortId` of its own — it is reached only through the Encounter (or, later,
 * Dungeon) that references it.
 */
export const mapInstances = pgTable("mapInstance", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  mapId: text("mapId"),
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
