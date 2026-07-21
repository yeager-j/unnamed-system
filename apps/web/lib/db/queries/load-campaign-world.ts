import { and, asc, eq, isNull } from "drizzle-orm"

import { db, type WriteExecutor } from "@/lib/db/client"
import {
  campaignArticle,
  campaignEventPlacement,
  campaignNpc,
  type CampaignArticleRow,
  type CampaignNpcRow,
} from "@/lib/db/schema/campaign-world"
import { entity, type EntityRow } from "@/lib/db/schema/entity"

/**
 * Reads over the campaign's **world substrate** (UNN-575): NPCs and Articles.
 * These are the discovery/list reads — the linker and the world list pages —
 * so both filter `deletedAt IS NULL` (tombstones leave the linker and list
 * surfaces by construction, D4). History-side rendering of a tombstone goes
 * through the participant resolver (`load-participants.ts`), which is
 * deliberately `deletedAt`-blind.
 */

/**
 * A loaded campaign NPC: its `campaignNpc` subtype row (traits / bond),
 * carrying the `entity` substrate it specializes at `.entity` — the D2
 * containment shape, the NPC parallel of `LoadedPlayerCharacter`.
 */
export type LoadedCampaignNpc = CampaignNpcRow & { entity: EntityRow }

/** The campaign's live NPCs, name-ordered — the NPC list page + linker read.
 *  Accepts an optional `executor` so the transactional entity handler's narrative
 *  gate reads the bond lanes inside its own attempt (UNN-674); defaults to `db`. */
export async function loadCampaignNpcs(
  campaignId: string,
  executor: WriteExecutor = db
): Promise<LoadedCampaignNpc[]> {
  const rows = await executor
    .select({ entity, npc: campaignNpc })
    .from(entity)
    .innerJoin(campaignNpc, eq(campaignNpc.entityId, entity.id))
    .where(
      and(eq(campaignNpc.campaignId, campaignId), isNull(entity.deletedAt))
    )
    .orderBy(asc(entity.name))
  return rows.map((row) => ({ ...row.npc, entity: row.entity }))
}

/** The campaign's live Articles, name-ordered — the Article list page + linker read. */
export async function loadCampaignArticles(
  campaignId: string
): Promise<CampaignArticleRow[]> {
  return db
    .select()
    .from(campaignArticle)
    .where(
      and(
        eq(campaignArticle.campaignId, campaignId),
        isNull(campaignArticle.deletedAt)
      )
    )
    .orderBy(asc(campaignArticle.name))
}

/** One live NPC by entity id — the NPC page load. Tombstone reads as absent (404). */
export async function loadCampaignNpc(
  campaignId: string,
  entityId: string
): Promise<LoadedCampaignNpc | undefined> {
  const [row] = await db
    .select({ entity, npc: campaignNpc })
    .from(entity)
    .innerJoin(campaignNpc, eq(campaignNpc.entityId, entity.id))
    .where(
      and(
        eq(campaignNpc.entityId, entityId),
        eq(campaignNpc.campaignId, campaignId),
        isNull(entity.deletedAt)
      )
    )
  return row === undefined ? undefined : { ...row.npc, entity: row.entity }
}

/** One live Article by id — the Article page load. Tombstone reads as absent (404). */
export async function loadCampaignArticle(
  campaignId: string,
  articleId: string
): Promise<CampaignArticleRow | undefined> {
  const [row] = await db
    .select()
    .from(campaignArticle)
    .where(
      and(
        eq(campaignArticle.id, articleId),
        eq(campaignArticle.campaignId, campaignId),
        isNull(campaignArticle.deletedAt)
      )
    )
  return row
}

/**
 * The campaign's live **deadline** Articles, `(datedDay, name)`-ordered — the
 * Calendar's deadline ribbon + day lines and the runner's advance-gate pre-warn
 * (D5). The inline dated facet is deadline-only (UNN-627), so this is every
 * inline-dated Article; events fan across days via {@link loadEventPlacements}.
 * Rides the `(campaignId, datedKind, datedDay)` index.
 */
export async function loadDeadlineArticles(
  campaignId: string
): Promise<CampaignArticleRow[]> {
  return db
    .select()
    .from(campaignArticle)
    .where(
      and(
        eq(campaignArticle.campaignId, campaignId),
        eq(campaignArticle.datedKind, "deadline"),
        isNull(campaignArticle.deletedAt)
      )
    )
    .orderBy(asc(campaignArticle.datedDay), asc(campaignArticle.name))
}

/** One event's placement onto a day — the Calendar's per-day event lines. */
export interface EventPlacement {
  placementId: string
  articleId: string
  name: string
  day: number
}

/**
 * The campaign's live **event placements** (UNN-627), `(day, name)`-ordered —
 * the Calendar fans an event Article across every day it is placed on. Joined
 * to live Articles only (`deletedAt IS NULL`), so a tombstoned event's
 * placements drop out for free (events are not history — D4). Rides the
 * `(campaignId, day)` index.
 */
export async function loadEventPlacements(
  campaignId: string
): Promise<EventPlacement[]> {
  const rows = await db
    .select({
      placementId: campaignEventPlacement.id,
      articleId: campaignEventPlacement.articleId,
      name: campaignArticle.name,
      day: campaignEventPlacement.day,
    })
    .from(campaignEventPlacement)
    .innerJoin(
      campaignArticle,
      eq(campaignArticle.id, campaignEventPlacement.articleId)
    )
    .where(
      and(
        eq(campaignEventPlacement.campaignId, campaignId),
        isNull(campaignArticle.deletedAt)
      )
    )
    .orderBy(asc(campaignEventPlacement.day), asc(campaignArticle.name))
  return rows
}

/**
 * One event Article's placement days, ascending (UNN-627) — the Article page's
 * dated badge, which lists every day the event recurs on.
 */
export async function loadEventPlacementsForArticle(
  campaignId: string,
  articleId: string
): Promise<{ placementId: string; day: number }[]> {
  return db
    .select({
      placementId: campaignEventPlacement.id,
      day: campaignEventPlacement.day,
    })
    .from(campaignEventPlacement)
    .where(
      and(
        eq(campaignEventPlacement.campaignId, campaignId),
        eq(campaignEventPlacement.articleId, articleId)
      )
    )
    .orderBy(asc(campaignEventPlacement.day))
}
