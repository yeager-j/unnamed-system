import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"

import {
  storedSessionSchema,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { type EncounterStatus } from "@workspace/game/foundation"

import { campaigns } from "./campaign"
import { mapInstances } from "./map-instance"

/**
 * An encounter is a run of the initiative tracker inside a campaign. Its whole
 * combat state — the engine-v2 {@link StoredSession} persisted contract
 * (UNN-535 hard cutover; durable participants as references, inline entities
 * embedded) — is persisted as one `session` jsonb blob (ADR Decision 3),
 * mirroring how the character row stores `battleConditions`. The DM
 * (`campaign.dmUserId`) is the sole writer, so a **single** `version`
 * optimistic-concurrency token suffices; every session write is guarded on
 * `(id, version)`.
 *
 * `shortId` backs the signed-out-visible player watch view; `status` gates the
 * single-live-encounter-per-campaign rule (enforced app-side, UNN-302).
 * {@link EncounterStatus} is owned by the game domain (`@workspace/game/foundation`).
 *
 * `mapInstanceId` references the encounter's spatial truth — the
 * {@link mapInstances} row that owns zones/occupancy/engagement/enchantment
 * (Dungeon Map ADR). The cutover (UNN-459) relocated the session's spatial fields
 * onto the Instance and flipped this **non-null**: every encounter mints an
 * Instance at create (the `restrict` FK keeps a referenced Instance alive; its
 * cleanup is app-managed — see `deleteCampaign`).
 */
export const encounters = pgTable("encounter", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  notes: text("notes"),
  mapInstanceId: text("mapInstanceId")
    .notNull()
    .references(() => mapInstances.id, {
      onDelete: "restrict",
    }),
  status: text("status").$type<EncounterStatus>().notNull().default("draft"),
  session: jsonb("session").$type<StoredSession>().notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const insertEncounterSchema = createInsertSchema(encounters, {
  session: storedSessionSchema,
})
export const selectEncounterSchema = createSelectSchema(encounters)

export type { EncounterStatus }
export type EncounterRow = typeof encounters.$inferSelect
