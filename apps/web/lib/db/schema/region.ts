import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type {
  RegionSettings,
  StaticReveal,
} from "@workspace/game-v2/generation"

import { campaigns } from "./campaign"
import { maps } from "./map"
import { templateSets } from "./template-set"

/**
 * A **Region** is a campaign-scoped procedural-dungeon designation — "this place
 * reshuffles from this seed Map by this Template Set" (Procedural Dungeons
 * technical design, D2/D5). It owns **no** Map Instance: every expedition is an
 * ordinary dungeon row that mints its own Instance and snapshots the **live**
 * seed Map at start, so authored edits arrive next expedition automatically and
 * visit-state dies with the run by construction.
 *
 * Its cross-expedition memory is **knowledge folds only**:
 * - `staticReveal` — explored state per source Map, written by
 *   `finishExpeditionAction` and re-applied at the next start. The shape and both
 *   operations live in game-v2's `generation/fold.ts`, its **only** touchpoint
 *   (ADR-0001 — a chart in escrow for the future Place model).
 * - `discoveredSiteKeys` — the site templates the party has found. The column
 *   ships now so P4's fold needs no migration; nothing writes it in P2.
 *
 * `settings` carries **authored defaults** only (D7): the wandering-table
 * designation is stamped onto each expedition's dungeon row at mint; runtime
 * truth stays on the dungeon row.
 *
 * FK lifecycle:
 * - `campaignId` → {@link campaigns} **cascade** — a Region dies with its campaign.
 * - `seedMapId` → {@link maps} / `templateSetId` → {@link templateSets}
 *   **restrict** — a Map or Set a Region depends on cannot be hard-deleted
 *   (tombstoning made concrete; the delete actions refuse app-side first).
 *
 * Regions **archive** (`archivedAt`), never soft-delete: once any expedition
 * exists, `dungeon.regionId`'s FK makes deletion impossible at the database.
 * Hard-delete exists only for the zero-expedition mistake case.
 */
export const regions = pgTable("region", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  seedMapId: text("seedMapId")
    .notNull()
    .references(() => maps.id, { onDelete: "restrict" }),
  templateSetId: text("templateSetId")
    .notNull()
    .references(() => templateSets.id, { onDelete: "restrict" }),
  settings: jsonb("settings").$type<RegionSettings>().notNull(),
  discoveredSiteKeys: jsonb("discoveredSiteKeys")
    .$type<string[]>()
    .notNull()
    .default([]),
  staticReveal: jsonb("staticReveal")
    .$type<StaticReveal>()
    .notNull()
    .default({}),
  archivedAt: timestamp("archivedAt", { mode: "date" }),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type RegionRow = typeof regions.$inferSelect
