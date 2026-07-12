import { and, asc, eq, isNull } from "drizzle-orm"

import { db } from "@/lib/db/client"
import {
  campaignArticle,
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

/** The campaign's live NPCs, name-ordered — the NPC list page + linker read. */
export async function loadCampaignNpcs(
  campaignId: string
): Promise<LoadedCampaignNpc[]> {
  const rows = await db
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
