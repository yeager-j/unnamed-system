import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

import { campaigns } from "./campaign"

/** Which forest a folder belongs to (D11): one tree per surface, never mixed. */
export type CampaignFolderKind = "article" | "npc" | "session"

/**
 * A **campaign folder** (Campaign Planner phase 6 — UNN-579, tech-design D11):
 * one node in the freeform folder tree that organizes a campaign's Articles,
 * NPCs, or story beats, as an **adjacency list** — `parentId IS NULL` is a
 * root; a move is a single-row `parentId` update.
 *
 * A **session** is a `kind = 'session'` folder (UNN-617): sessions were always
 * documented as purely organizational, which is what a folder is — so the flat
 * `campaignSession` table dissolved into this one and beats file through
 * `campaignBeat.folderId` like every other tree item.
 *
 * **Kind agreement is a DB fact:** the `(id, kind)` unique lets the self-FK be
 * the composite `(parentId, kind) → (id, kind)`, so a cross-kind parent is
 * unrepresentable. Item membership (`folderId` on the article/NPC/beat rows) is
 * a plain FK; its kind/campaign agreement is action-validated (§5 boundary rule).
 *
 * The self-FK **cascades**: deleting a folder deletes its subtree's folders in
 * one statement while each folder's contents float to the derived Unfiled via
 * their own SET-NULL FKs. Folders **hard-delete** — purely organizational,
 * nothing historical references one (unlike articles' tombstones). Cycles are
 * not representable-proof: the move action's ancestor walk rejects them, and
 * the tree builder degrades any unrooted node's contents to Unfiled.
 */
export const campaignFolder = pgTable(
  "campaignFolder",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CampaignFolderKind>().notNull(),
    parentId: text("parentId"),
    name: text("name").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (folder) => [
    unique("campaignFolder_id_kind_unique").on(folder.id, folder.kind),
    foreignKey({
      name: "campaignFolder_parent_fk",
      columns: [folder.parentId, folder.kind],
      foreignColumns: [folder.id, folder.kind],
    }).onDelete("cascade"),
    index("campaignFolder_campaign_kind_idx").on(
      folder.campaignId,
      folder.kind
    ),
  ]
)

/** The persisted folder row shape (typed off the table). */
export type CampaignFolderRow = typeof campaignFolder.$inferSelect
