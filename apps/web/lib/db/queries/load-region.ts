import { and, desc, eq, isNull } from "drizzle-orm"

import {
  discoveredSiteKeysSchema,
  regionSettingsSchema,
  staticRevealSchema,
} from "@workspace/game-v2/generation"

import { db, type WriteExecutor } from "@/lib/db/client"
import { dungeons, type DungeonStatus } from "@/lib/db/schema/dungeon"
import { maps } from "@/lib/db/schema/map"
import { regions, type RegionRow } from "@/lib/db/schema/region"

/**
 * Reads for the `region` table — the campaign-scoped procedural-dungeon
 * designation (UNN-589 D2/D5). Like the dungeon loader, every row-shaped read
 * parses its jsonb blobs on the way out ({@link withParsedBlobs}) so the
 * columns' compile-time `$type` casts can't hand a caller a blob that predates
 * a schema field.
 *
 * Both knowledge columns are parsed here but **interpreted** only by game-v2's
 * generation modules: `fold.ts` owns their finish-time union and
 * `declarations.ts` derives checklist annotations. This loader only proves the
 * stored shapes.
 */
function withParsedBlobs(row: RegionRow): RegionRow {
  return {
    ...row,
    settings: regionSettingsSchema.parse(row.settings),
    discoveredSiteKeys: discoveredSiteKeysSchema.parse(row.discoveredSiteKeys),
    staticReveal: staticRevealSchema.parse(row.staticReveal),
  }
}

/** The `region` row by primary-key `id` (blobs parsed), or `null` — the lookup
 *  a write action resolves before its campaign-DM gate. Archive-blind: writes
 *  decide archived-ness themselves (an archived Region still finishes its
 *  running expedition). Takes an optional `executor` so expedition finish can
 *  read the region's version **inside** its lifecycle transaction (the client
 *  never holds a region token; the fold guards on this in-tx read). */
export async function loadRegionRowById(
  regionId: string,
  executor: WriteExecutor = db
): Promise<RegionRow | null> {
  const [row] = await executor
    .select()
    .from(regions)
    .where(eq(regions.id, regionId))
    .limit(1)

  return row ? withParsedBlobs(row) : null
}

/** The `region` row by public `shortId` (blobs parsed), or `null` — the detail
 *  page's lookup. Archive-blind for the same reason as the by-id read. */
export async function loadRegionByShortId(
  shortId: string
): Promise<RegionRow | null> {
  const [row] = await db
    .select()
    .from(regions)
    .where(eq(regions.shortId, shortId))
    .limit(1)

  return row ? withParsedBlobs(row) : null
}

/** Summary row for the campaign Manage page's Regions section — the columns the
 *  list renders, never the fold blobs. Mirrors `DungeonSummary`. */
export interface RegionSummary {
  id: string
  shortId: string
  name: string
  seedMapName: string
  createdAt: Date
}

/**
 * Every unarchived Region in a campaign, newest first, as the lightweight
 * {@link RegionSummary} projection (joined to the seed Map for its display
 * name). A discovery/list read, so it filters `archivedAt IS NULL` — archived
 * Regions leave the campaign surfaces while their rows survive for the
 * expedition history's sake.
 */
export async function loadRegionsForCampaign(
  campaignId: string
): Promise<RegionSummary[]> {
  return db
    .select({
      id: regions.id,
      shortId: regions.shortId,
      name: regions.name,
      seedMapName: maps.name,
      createdAt: regions.createdAt,
    })
    .from(regions)
    .innerJoin(maps, eq(maps.id, regions.seedMapId))
    .where(and(eq(regions.campaignId, campaignId), isNull(regions.archivedAt)))
    .orderBy(desc(regions.createdAt))
}

/** Expedition summary for the Region detail's history list — the dungeon
 *  summary columns, scoped to one Region. */
export interface ExpeditionSummary {
  id: string
  shortId: string
  name: string
  status: DungeonStatus
  createdAt: Date
}

/**
 * Every live expedition of a Region, newest first. The Region detail page is
 * the expeditions' curated home (the generic campaign dungeons list filters
 * them out); like that list this is a discovery read, so archived (soft-deleted)
 * expeditions drop off.
 */
export async function loadExpeditionsForRegion(
  regionId: string
): Promise<ExpeditionSummary[]> {
  return db
    .select({
      id: dungeons.id,
      shortId: dungeons.shortId,
      name: dungeons.name,
      status: dungeons.status,
      createdAt: dungeons.createdAt,
    })
    .from(dungeons)
    .where(and(eq(dungeons.regionId, regionId), isNull(dungeons.deletedAt)))
    .orderBy(desc(dungeons.createdAt))
}

/**
 * The Region's single running expedition, or `null` — the read behind the
 * Region-stable watch link (players keep one URL across expeditions; the
 * redirect resolves it to the current run's watch).
 */
export async function loadActiveExpeditionForRegion(
  regionId: string
): Promise<{ shortId: string } | null> {
  const [row] = await db
    .select({ shortId: dungeons.shortId })
    .from(dungeons)
    .where(
      and(
        eq(dungeons.regionId, regionId),
        eq(dungeons.status, "active"),
        isNull(dungeons.deletedAt)
      )
    )
    .limit(1)

  return row ?? null
}

/**
 * Whether any expedition row references this Region — **including** soft-deleted
 * ones: the FK sees tombstoned rows, and frozen campaign history keeps resolving
 * them, so archive-vs-hard-delete is decided over every row ever minted.
 */
export async function regionHasExpeditions(regionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: dungeons.id })
    .from(dungeons)
    .where(eq(dungeons.regionId, regionId))
    .limit(1)

  return row !== undefined
}

/** Whether any Region designates this Map as its seed — the app-side refusal
 *  ahead of `region.seedMapId`'s restrict FK (a hard Map delete would otherwise
 *  surface as a 500, not a domain error). */
export async function regionReferencesMap(mapId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: regions.id })
    .from(regions)
    .where(eq(regions.seedMapId, mapId))
    .limit(1)

  return row !== undefined
}

/** Whether any Region rolls from this Template Set — the app-side refusal the
 *  set's soft delete needs (a tombstone never trips the restrict FK, so without
 *  this check a referenced set could vanish from under its Regions). */
export async function regionReferencesTemplateSet(
  templateSetId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: regions.id })
    .from(regions)
    .where(eq(regions.templateSetId, templateSetId))
    .limit(1)

  return row !== undefined
}
