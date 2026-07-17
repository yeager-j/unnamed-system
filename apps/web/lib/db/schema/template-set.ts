import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type { TemplateSetContent } from "@workspace/game-v2/generation"

import { users } from "./user"

/**
 * A **Template Set** is a reusable, **user-owned** authoring library — the zone
 * templates + content tables + set-level knobs a Region rolls from at generation
 * time (Procedural Dungeons PRD, *Template Sets*; the same ownership shape as a
 * {@link import("./map").maps} row: user-owned, campaign-agnostic). The Region
 * reads the **live** set, so there is no per-expedition snapshot — tuning applies
 * from the next roll onward. Its whole authored {@link TemplateSetContent}
 * (`templates`, `tables`, order arrays, `connectorTemplateKey`, `closureChance`)
 * persists as one `content` jsonb blob, guarded by a single `version` token — the
 * same optimistic-concurrency shape as a Map's `geometry`.
 *
 * `shortId` backs the owner-only editor URL (`/stage/sets/{shortId}`). Writes gate
 * on the owner (`requireTemplateSetOwner`, `templateSet.userId === viewer`).
 *
 * **Soft delete** via `deletedAt` (house convention, like `dungeon.deletedAt`),
 * not the hard delete Maps use: P2 adds a `region.templateSetId` **restrict** FK,
 * and a referenced set must survive as a tombstone rather than vanish. Every read
 * filters `deletedAt IS NULL`; a soft delete never trips the future restrict FK.
 */
export const templateSets = pgTable("templateSet", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: jsonb("content").$type<TemplateSetContent>().notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deletedAt", { mode: "date" }),
})

export type TemplateSetRow = typeof templateSets.$inferSelect
