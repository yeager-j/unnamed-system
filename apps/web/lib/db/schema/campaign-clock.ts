import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

import { campaigns } from "./campaign"
import { dungeons } from "./dungeon"

/**
 * One entry of a campaign's default-slots template ({@link campaignClock.slotTemplate}):
 * the label a freshly materialized slot is born with (e.g. "Morning", "Evening").
 */
export type SlotTemplateEntry = { label: string }

/**
 * The **campaign clock** (Campaign Planner phase 1 — UNN-574, tech-design D1):
 * one row per campaign, minted by the explicit "Start the clock" action. A day
 * is a **plain integer** — no day table; facts attach sparsely by day number,
 * and the horizon is derived (`max(day)` over {@link campaignSlot} rows), never
 * stored.
 *
 * `slotTemplate` is the default-slots template new days materialize from
 * (CHECK-enforced minimum one entry — you can never stand on a day without
 * slots). It applies **forward-only**: editing it (Manage Campaign → "Day
 * structure") affects only days materialized afterward.
 *
 * `storyTier` is the party's shared narrative arc (D8), DM-advanced, treated as
 * 0 by readers when the clock hasn't been started.
 *
 * `clockVersion` is the optimistic-concurrency token every **clock-structural**
 * write (advance / un-advance / time-skip / add-days / per-day slot edits /
 * template edit) guards on, matching the house guarded compare-and-bump
 * pattern; the advance's materialize-then-bump runs as one transaction with
 * the CAS last (D6).
 */
export const campaignClock = pgTable(
  "campaignClock",
  {
    campaignId: text("campaignId")
      .primaryKey()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    currentDay: integer("currentDay").notNull(),
    slotTemplate: jsonb("slotTemplate").$type<SlotTemplateEntry[]>().notNull(),
    storyTier: integer("storyTier").notNull().default(0),
    clockVersion: integer("clockVersion").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (clock) => [
    check("campaignClock_currentDay_min", sql`${clock.currentDay} >= 1`),
    check(
      "campaignClock_storyTier_range",
      sql`${clock.storyTier} BETWEEN 0 AND 4`
    ),
    check(
      "campaignClock_slotTemplate_min_one",
      sql`jsonb_array_length(${clock.slotTemplate}) >= 1`
    ),
  ]
)

/**
 * A **time slot** on a campaign day (D1 — semi-materialized): one row per slot,
 * the single read path for "a day's slots". Rows spring into existence from the
 * clock's template at exactly three write points — start-the-clock, add-days,
 * and advance/time-skip (every day in `(oldDay, newDay]` that has none).
 *
 * `day` is **immutable** — slots are created, renamed, and deleted, never
 * moved. That immutability is what makes later phases' `campaignUpdate.day`
 * denormalization safe. Slot **kind** (story/dungeon/downtime) is never stored:
 * it is derived from what claims the slot (a beat → story; a dungeon claim →
 * dungeon; else downtime — §0's one-stored-fact rule).
 */
export const campaignSlot = pgTable(
  "campaignSlot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    ordinal: integer("ordinal").notNull(),
    label: text("label").notNull(),
  },
  (slot) => [
    unique("campaignSlot_campaign_day_ordinal_unique").on(
      slot.campaignId,
      slot.day,
      slot.ordinal
    ),
    index("campaignSlot_campaign_day_idx").on(slot.campaignId, slot.day),
    check("campaignSlot_day_min", sql`${slot.day} >= 1`),
  ]
)

/**
 * A sparse **season label** (D1, PRD FR-8): "Late Thaw" starting on a day and
 * inheriting forward until the next row — a flavor label, not a calendar
 * engine. `seasonOf(day)` in `domain/planner` does the inherit-forward scan.
 */
export const campaignSeason = pgTable(
  "campaignSeason",
  {
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    label: text("label").notNull(),
  },
  (season) => [
    primaryKey({ columns: [season.campaignId, season.day] }),
    check("campaignSeason_day_min", sql`${season.day} >= 1`),
  ]
)

/**
 * A **dungeon slot claim** (Campaign Planner phase 4 — UNN-577, tech-design
 * D9): the mirror of how a scheduled beat claims a slot, as a concrete
 * per-kind claim table — `slotId` PK is the one-dungeon-per-slot fact the
 * slot-kind derivation reads. Many slots per dungeon is free (a delve that
 * runs long claims the next slot with the same dungeon).
 *
 * `dungeonId` **cascades**: deleting the dungeon reverts its slots to
 * downtime. No dungeon-delete write exists yet; when one lands it must add a
 * frozen-past guard (claims on `day < currentDay` are history's structure,
 * matching {@link deleteBeat}'s block) rather than letting the cascade rewrite
 * past days — tracked as UNN-616. `slotId` RESTRICTs like
 * `campaignUpdate.slotId` — a claimed slot can't be deleted out from under
 * its claim.
 *
 * Mutual exclusion with beats (never both on one slot) is a write-boundary
 * check under a `FOR UPDATE` slot lock, not a constraint — each table's
 * unique guards its own side.
 */
export const campaignSlotDungeon = pgTable(
  "campaignSlotDungeon",
  {
    slotId: text("slotId")
      .primaryKey()
      .references(() => campaignSlot.id, { onDelete: "restrict" }),
    dungeonId: text("dungeonId")
      .notNull()
      .references(() => dungeons.id, { onDelete: "cascade" }),
    resolvedAt: timestamp("resolvedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (claim) => [index("campaignSlotDungeon_dungeon_idx").on(claim.dungeonId)]
)

/** The persisted clock row shape (typed off the table). */
export type CampaignClockRow = typeof campaignClock.$inferSelect

/** The persisted slot row shape (typed off the table). */
export type CampaignSlotRow = typeof campaignSlot.$inferSelect

/** The persisted season row shape (typed off the table). */
export type CampaignSeasonRow = typeof campaignSeason.$inferSelect

/** The persisted dungeon slot claim shape (typed off the table). */
export type CampaignSlotDungeonRow = typeof campaignSlotDungeon.$inferSelect
