import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { ParticipantKind } from "@/domain/planner/participant"

import { campaigns } from "./campaign"
import { campaignSlot } from "./campaign-clock"

/**
 * A **session** (Campaign Planner phase 3 — UNN-576, PRD FR-4): an
 * organizational folder in Session Notes. Flat — no nesting — and purely
 * organizational: a session never couples to the clock. Beats with no session
 * (`campaignBeat.sessionId IS NULL`) live in the virtual **Unfiled** folder,
 * which is derived, never a magic row; deleting a session floats its beats
 * there via the FK's SET NULL.
 */
export const campaignSession = pgTable("campaignSession", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/**
 * A **story beat** (phase 3, PRD FR-4): one prep note — title + tagline +
 * markdown body with inline participant chip tokens (D7). Prep-side, not a
 * participant: nothing references a beat except its own mention index.
 *
 * The **schedule** is one fact across two columns: `scheduledSlotId` (a
 * concrete slot), `floating` ("run anytime"), or neither ("not scheduled") —
 * the CHECK forbids holding both. The partial unique makes **one beat per
 * slot** a database fact (D6), which is also what derives a slot's story kind
 * (§0: beat → story). `deferredFromSlotId` is phase-4 Defer's provenance
 * ("return to Day 15 · Morning"), minted now so the column set is complete.
 *
 * Content columns are **last-write-wins** (D6 — single-author prose): no
 * version token, autosaved with no revalidation (D10).
 */
export const campaignBeat = pgTable(
  "campaignBeat",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => campaignSession.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default(""),
    tagline: text("tagline").notNull().default(""),
    /** Markdown body with inline participant chip tokens (D7). */
    body: text("body").notNull().default(""),
    scheduledSlotId: text("scheduledSlotId").references(() => campaignSlot.id, {
      onDelete: "set null",
    }),
    floating: boolean("floating").notNull().default(false),
    deferredFromSlotId: text("deferredFromSlotId").references(
      () => campaignSlot.id,
      { onDelete: "set null" }
    ),
    resolvedAt: timestamp("resolvedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (beat) => [
    check(
      "campaignBeat_not_scheduled_and_floating",
      sql`NOT (${beat.scheduledSlotId} IS NOT NULL AND ${beat.floating})`
    ),
    uniqueIndex("campaignBeat_scheduledSlot_unique")
      .on(beat.scheduledSlotId)
      .where(sql`${beat.scheduledSlotId} IS NOT NULL`),
    index("campaignBeat_campaign_session_idx").on(
      beat.campaignId,
      beat.sessionId
    ),
  ]
)

/**
 * The **mention index** (D7): the participant refs extracted from a beat
 * body's chip tokens, re-derived on every body autosave — fully rebuildable,
 * never authored. Powers "Referenced in N beats" on entity pages (phase 6)
 * without making beats participants.
 */
export const campaignBeatMention = pgTable(
  "campaignBeatMention",
  {
    beatId: text("beatId")
      .notNull()
      .references(() => campaignBeat.id, { onDelete: "cascade" }),
    participantKind: text("participantKind").$type<ParticipantKind>().notNull(),
    participantId: text("participantId").notNull(),
  },
  (mention) => [
    primaryKey({
      columns: [mention.beatId, mention.participantKind, mention.participantId],
    }),
    index("campaignBeatMention_participant_idx").on(
      mention.participantKind,
      mention.participantId
    ),
  ]
)

/** The persisted session row shape (typed off the table). */
export type CampaignSessionRow = typeof campaignSession.$inferSelect

/** The persisted beat row shape (typed off the table). */
export type CampaignBeatRow = typeof campaignBeat.$inferSelect

/** The persisted beat-mention row shape (typed off the table). */
export type CampaignBeatMentionRow = typeof campaignBeatMention.$inferSelect
