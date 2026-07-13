import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { ParticipantKind } from "@/domain/planner/participant"
import type { UpdateCategory } from "@/domain/planner/update-category"

import { campaigns } from "./campaign"
import { campaignSlot } from "./campaign-clock"
import { campaignArticle } from "./campaign-world"

// The category vocabulary homes in domain (the `ParticipantKind` precedent);
// re-exported here so schema stays the one import for row-adjacent types.
export {
  UPDATE_CATEGORIES,
  type UpdateCategory,
} from "@/domain/planner/update-category"

/**
 * The **single update stream** (Campaign Planner phase 3 — UNN-576,
 * tech-design D3): `campaignUpdate` is the one timeline unit. A downtime
 * activity is the same row carrying the **downtime facet** (`slotId` +
 * `category`); a world update is the row with the facet absent. The mock's
 * `world | auto` kind is derived from `slotId` nullability — editing an
 * activity from the Day Runner and from the Chronicle edits the one row.
 *
 * `day` is a **safe denormalization**: for slotted rows it is server-derived
 * from the slot at write time and never client-editable — safe because a
 * slot's `day` is itself immutable (D1). It keeps the Chronicle's cursor
 * index join-free. Re-dating a slotted row is defined as **detaching** it
 * (clear `slotId`, keep the category) and only then accepting a new day.
 *
 * The **primary participant is optional** (`primaryKind`/`primaryId` both
 * null ⇒ "the world" — ambient events land on no entity timeline); downtime
 * rows always carry the character as primary, CHECK-enforced. Participant
 * refs are the FK-less two-column soft ref (D4); the write boundary (§5)
 * validates every ref against the gated campaign.
 *
 * `resolvesArticleId` is the ⚑ deadline-resolution marker (D5): the marker
 * IS the resolution — the partial unique makes "at most one marker per
 * article" a database fact. Markers are world updates (CHECK), so they can
 * never be trapped in a slot. RESTRICT is moot in practice (articles only
 * soft-delete) but honest.
 *
 * `slotId` is **RESTRICT**: recorded downtime blocks slot deletion. No
 * delete-slot write exists yet (phase 1 ships add/rename only) — when it
 * lands (write map: "Delete slot"), it must pre-check for entries and map
 * the 23503 violation to a reasoned error.
 */
export const campaignUpdate = pgTable(
  "campaignUpdate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    primaryKind: text("primaryKind").$type<ParticipantKind>(),
    primaryId: text("primaryId"),
    /** Markdown body; may be empty only for `category = 'idle'` (app rule). */
    body: text("body").notNull().default(""),
    category: text("category").$type<UpdateCategory>(),
    slotId: text("slotId").references(() => campaignSlot.id, {
      onDelete: "restrict",
    }),
    resolvesArticleId: text("resolvesArticleId").references(
      () => campaignArticle.id,
      { onDelete: "restrict" }
    ),
    /**
     * Millisecond precision on purpose (UNN-580): `authoredAt` is a
     * Chronicle-cursor column, and a JS `Date` only carries milliseconds —
     * a µs-precision column would truncate on read and let a keyset page
     * boundary skip rows between the truncated and stored value. Precision
     * 3 makes the DB↔JS round-trip exact by construction.
     */
    authoredAt: timestamp("authoredAt", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (update) => [
    check("campaignUpdate_day_min", sql`${update.day} >= 1`),
    check(
      "campaignUpdate_primary_set_together",
      sql`(${update.primaryKind} IS NULL) = (${update.primaryId} IS NULL)`
    ),
    check(
      "campaignUpdate_slotted_categorized",
      sql`${update.slotId} IS NULL OR ${update.category} IS NOT NULL`
    ),
    check(
      "campaignUpdate_slotted_primaried",
      sql`${update.slotId} IS NULL OR ${update.primaryKind} IS NOT NULL`
    ),
    check(
      "campaignUpdate_marker_is_world",
      sql`${update.resolvesArticleId} IS NULL OR ${update.slotId} IS NULL`
    ),
    uniqueIndex("campaignUpdate_resolvesArticle_unique")
      .on(update.resolvesArticleId)
      .where(sql`${update.resolvesArticleId} IS NOT NULL`),
    uniqueIndex("campaignUpdate_slot_primary_unique")
      .on(update.slotId, update.primaryId)
      .where(sql`${update.slotId} IS NOT NULL`),
    index("campaignUpdate_chronicle_cursor_idx").on(
      update.campaignId,
      update.day,
      update.authoredAt
    ),
    index("campaignUpdate_primary_idx").on(
      update.campaignId,
      update.primaryKind,
      update.primaryId
    ),
  ]
)

/**
 * An update's **concerns** (D3/D4): the participants an update touches beyond
 * its primary — rendered as chips, echoed onto each concerned entity's
 * timeline, and counted by bond progress (Collaborator updates *concerning*
 * the NPC). Authored (picked in the composer), unlike the derived beat
 * mention index.
 */
export const campaignUpdateConcern = pgTable(
  "campaignUpdateConcern",
  {
    updateId: text("updateId")
      .notNull()
      .references(() => campaignUpdate.id, { onDelete: "cascade" }),
    participantKind: text("participantKind").$type<ParticipantKind>().notNull(),
    participantId: text("participantId").notNull(),
  },
  (concern) => [
    primaryKey({
      columns: [
        concern.updateId,
        concern.participantKind,
        concern.participantId,
      ],
    }),
    index("campaignUpdateConcern_participant_idx").on(
      concern.participantKind,
      concern.participantId
    ),
  ]
)

/** The persisted update row shape (typed off the table). */
export type CampaignUpdateRow = typeof campaignUpdate.$inferSelect

/** The persisted update-concern row shape (typed off the table). */
export type CampaignUpdateConcernRow = typeof campaignUpdateConcern.$inferSelect
