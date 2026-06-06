import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"

import {
  combatSessionSchema,
  type CombatSession,
  type EncounterStatus,
} from "@workspace/game/foundation"

import { campaigns } from "./campaign"

/**
 * An encounter is a run of the initiative tracker inside a campaign. Its whole
 * combat state — the immutable {@link CombatSession} the pure reducer operates
 * over — is persisted as one `session` jsonb blob (ADR Decision 3), mirroring
 * how the character row stores `battleConditions`. The DM (`campaign.dmUserId`)
 * is the sole writer, so a **single** `version` optimistic-concurrency token
 * suffices; every session write is guarded on `(id, version)`.
 *
 * `shortId` backs the signed-out-visible player watch view; `status` gates the
 * single-live-encounter-per-campaign rule (enforced app-side, UNN-302).
 * {@link EncounterStatus} is owned by the game domain (`@workspace/game/foundation`).
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
  status: text("status").$type<EncounterStatus>().notNull().default("draft"),
  session: jsonb("session").$type<CombatSession>().notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const insertEncounterSchema = createInsertSchema(encounters, {
  session: combatSessionSchema,
})
export const selectEncounterSchema = createSelectSchema(encounters)

export type { EncounterStatus }
export type EncounterRow = typeof encounters.$inferSelect
