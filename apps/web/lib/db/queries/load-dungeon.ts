import { and, desc, eq, isNull } from "drizzle-orm"

import { dungeonStateSchema } from "@workspace/game-v2/spatial"

import { db } from "@/lib/db/client"
import {
  dungeons,
  type DungeonRow,
  type DungeonStatus,
} from "@/lib/db/schema/dungeon"

/**
 * Reads for the `dungeon` table — the exploration-time layer over a Map Instance
 * (Dungeon Map ADR). Like the encounter loader there is no game-engine *hydrate*
 * step: the `state` jsonb already is the full delve state. It is run through
 * {@link withParsedState} on read so the column's compile-time `$type` cast can't
 * hand a caller a blob that predates a schema field — the same defensive parse the
 * encounter (`session`) and Map Instance (`state`) loaders apply.
 */
function withParsedState(row: DungeonRow): DungeonRow {
  return { ...row, state: dungeonStateSchema.parse(row.state) }
}

/** The `dungeon` row by public `shortId` (state parsed), or `null` when none
 *  matches — the lookup the DM console (`getDungeonForDM`) resolves. */
export async function loadDungeonRowByShortId(
  shortId: string
): Promise<DungeonRow | null> {
  const [row] = await db
    .select()
    .from(dungeons)
    .where(eq(dungeons.shortId, shortId))
    .limit(1)

  return row ? withParsedState(row) : null
}

/** The `dungeon` row by primary-key `id` (state parsed), or `null` when none
 *  matches — the lookup a write action resolves after the campaign-DM gate to
 *  reduce + persist the delve state. Peers {@link loadDungeonRowByShortId}. */
export async function loadDungeonRowById(
  dungeonId: string
): Promise<DungeonRow | null> {
  const [row] = await db
    .select()
    .from(dungeons)
    .where(eq(dungeons.id, dungeonId))
    .limit(1)

  return row ? withParsedState(row) : null
}

/**
 * The dungeon's `campaignId` only, or `null` when no dungeon matches. Lets a
 * write action authorize the caller against the owning campaign
 * (`requireCampaignDM`) *before* loading the `state` blob — the resolver every
 * dungeon/Instance write composes with the gate (parallels
 * `loadEncounterCampaignId`). Selects one column, so the read is index-light.
 */
export async function loadDungeonCampaignId(
  dungeonId: string
): Promise<string | null> {
  const [row] = await db
    .select({ campaignId: dungeons.campaignId })
    .from(dungeons)
    .where(eq(dungeons.id, dungeonId))
    .limit(1)

  return row?.campaignId ?? null
}

/**
 * The dungeon's current optimistic `version` only (by public `shortId`), or
 * `null` when no dungeon matches — stale-retry parity with encounters
 * (`loadEncounterVersionByShortId`): when a guarded write returns `"stale"`, the
 * queued-write hook refetches the fresh token here and retries once. Selects one
 * column, so the read is index-light.
 */
export async function loadDungeonVersionByShortId(
  shortId: string
): Promise<number | null> {
  const [row] = await db
    .select({ version: dungeons.version })
    .from(dungeons)
    .where(eq(dungeons.shortId, shortId))
    .limit(1)

  return row?.version ?? null
}

/** Summary row for the campaign page's dungeons list (UNN-465) — the columns the
 *  list renders, never the heavy `state` blob. Mirrors `EncounterSummary`. */
export interface DungeonSummary {
  id: string
  shortId: string
  name: string
  status: DungeonStatus
  createdAt: Date
}

/**
 * Every **live** dungeon in a campaign, newest first, as the lightweight
 * {@link DungeonSummary} projection (no `state` jsonb). Backs the campaign page's
 * dungeons list + the runner's "Run a dungeon" picker (UNN-465); the single
 * active one for the banner + the one-active guard comes from
 * {@link loadActiveDungeonForCampaign}.
 *
 * A discovery/list read, so it filters `deletedAt IS NULL` — archived delves
 * leave the roster and picker (the tombstone-family idiom, mirroring
 * `load-campaign-world.ts`). History reads (`loadClaimsForSlots`, the participant
 * resolver, by-`shortId` console load) stay `deletedAt`-blind by contrast.
 */
export async function loadDungeonsForCampaign(
  campaignId: string
): Promise<DungeonSummary[]> {
  return db
    .select({
      id: dungeons.id,
      shortId: dungeons.shortId,
      name: dungeons.name,
      status: dungeons.status,
      createdAt: dungeons.createdAt,
    })
    .from(dungeons)
    .where(and(eq(dungeons.campaignId, campaignId), isNull(dungeons.deletedAt)))
    .orderBy(desc(dungeons.createdAt))
}

/**
 * The campaign's single `active` dungeon, or `null` if none is active. Backs the
 * one-active-delve-per-campaign guard (UNN-465, mirroring the one-live-encounter
 * rule): the draft→active transition reads this before flipping a draft to
 * `active` and rejects the transition when another delve in the same campaign
 * already holds the slot. App-side enforcement — there is no DB uniqueness
 * constraint for MVP, matching the encounters single-live guard.
 *
 * A **live-occupancy** read, so it filters `deletedAt IS NULL` (the tombstone-
 * family rule — `entity`): an archived delve must not keep holding the
 * one-active slot and blocking a fresh delve (UNN-616).
 */
export async function loadActiveDungeonForCampaign(
  campaignId: string
): Promise<DungeonRow | null> {
  const [row] = await db
    .select()
    .from(dungeons)
    .where(
      and(
        eq(dungeons.campaignId, campaignId),
        eq(dungeons.status, "active"),
        isNull(dungeons.deletedAt)
      )
    )
    .limit(1)

  return row ? withParsedState(row) : null
}
