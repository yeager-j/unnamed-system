import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"

import { users } from "./user"

/**
 * A **Campaign** is the durable DM↔player boundary that gates the initiative
 * tracker (ADR Decision 9). One user owns it as the DM (`dmUserId`); it carries
 * the player roster ({@link campaignUsers}) and the characters placed into it
 * (`characters.campaignId`). The campaign — not a live encounter — is the
 * authorization authority: `requireOwnerOrCampaignDM` (UNN-297) is a single FK
 * hop from a placed character to `campaign.dmUserId`.
 *
 * `shortId` backs the shareable `/join/{token}` link and the manage-page URL.
 */
export const campaigns = pgTable("campaign", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  dmUserId: text("dmUserId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/**
 * The player roster: *who* is in a campaign, modeled separately from *which
 * characters are placed* (`characters.campaignId`) so a player's membership
 * stays stable as their characters die or get swapped (ADR Decision 9's
 * two-level membership). The DM is `campaign.dmUserId`, never a row here.
 *
 * `(campaignId, userId)` is the natural key — a user is in a campaign at most
 * once. Both FKs cascade on delete: removing the campaign or the user clears the
 * corresponding membership rows.
 */
export const campaignUsers = pgTable(
  "campaignUser",
  {
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (campaignUser) => [
    primaryKey({ columns: [campaignUser.campaignId, campaignUser.userId] }),
  ]
)

export const insertCampaignSchema = createInsertSchema(campaigns)
export const selectCampaignSchema = createSelectSchema(campaigns)

export const insertCampaignUserSchema = createInsertSchema(campaignUsers)
export const selectCampaignUserSchema = createSelectSchema(campaignUsers)

export type CampaignRow = typeof campaigns.$inferSelect
export type CampaignUserRow = typeof campaignUsers.$inferSelect
