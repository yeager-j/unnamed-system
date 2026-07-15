import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type { DungeonState, DungeonStatus } from "@workspace/game-v2/spatial"

import { campaigns } from "./campaign"
import { mapInstances } from "./map-instance"

/**
 * A **Dungeon** is the exploration-time temporal layer over a Map Instance — the
 * delve (Dungeon Map ADR, *The four-entity model*). It owns **no** geography (the
 * Instance does); its whole exploration state — the {@link DungeonState} the pure
 * `reduceDungeon` will operate over (UNN-463) — persists as one `state` jsonb blob
 * (turn counter, `actedCharacterIds`, DM-only reminder settings), mirroring how an
 * encounter stores its `session`. A single `version` token guards every write.
 *
 * `shortId` backs the DM console (`/campaigns/{c}/dungeon/{d}`) and the player fog view
 * (`/campaigns/{c}/dungeon/{d}/watch`). {@link DungeonStatus} (`draft`/`active`/`done`) is
 * owned by the game domain (`@workspace/game-v2/spatial`).
 *
 * FK lifecycle (ADR, *FK lifecycle*):
 * - `campaignId` → {@link campaigns} **cascade** — a dungeon dies with its
 *   campaign, exactly as encounters do.
 * - `mapInstanceId` → {@link mapInstances} **restrict** — the dungeon *owns* its
 *   Instance, but deletion order is app-managed (delete the Instance with the
 *   dungeon) so a live Encounter sharing the Instance is never left stranded.
 *
 * Dungeons **tombstone** (`deletedAt`, the soft-delete family — `entity` R1,
 * `campaignArticle`/`campaignNpc` D4): history survives its subjects, so a
 * frozen slot claim keeps resolving the delve's name (rendered muted) while the
 * roster/picker surfaces drop it. The flip lives in `archiveDungeon`
 * (`writes/dungeon.ts`).
 *
 * Writes gate on the campaign DM (`requireCampaignDM(dungeon.campaignId)`); the
 * DM console loads through `getDungeonForDM` (≅ `getEncounterForDM`).
 */
export const dungeons = pgTable("dungeon", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  mapInstanceId: text("mapInstanceId")
    .notNull()
    .references(() => mapInstances.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  status: text("status").$type<DungeonStatus>().notNull().default("draft"),
  state: jsonb("state").$type<DungeonState>().notNull(),
  version: integer("version").notNull().default(0),
  deletedAt: timestamp("deletedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type { DungeonStatus }
export type DungeonRow = typeof dungeons.$inferSelect
