import type { LoadedCampaignNpc } from "@/lib/db/queries/load-campaign-world"
import type { CampaignArticleRow } from "@/lib/db/schema/campaign-world"

import { isStubNpc } from "../npc"
import { articleIconKey, npcTraitsLabel, type LinkerIconKey } from "./linker"

/** One row of the NPCs list page. */
export interface NpcListRowView {
  entityId: string
  name: string
  /** "The Moon · Warlock", or null when neither trait is authored. */
  traits: string | null
  /** Quick-minted and not yet authored (§0's stub selector) — renders the Stub badge. */
  isStub: boolean
}

/**
 * Shapes the campaign's live NPCs (`loadCampaignNpcs`) into the NPCs list
 * page's rows: name, authored traits, and the stub badge — the §0 selector
 * applied here in the data tier so the component just renders (UNN-610).
 */
export function buildNpcListView(
  npcs: readonly LoadedCampaignNpc[]
): NpcListRowView[] {
  return npcs.map((npc) => ({
    entityId: npc.entityId,
    name: npc.entity.name,
    traits: npcTraitsLabel(npc),
    isStub: isStubNpc({
      arcana: npc.arcana,
      lineageKey: npc.lineageKey,
      entity: { narrative: npc.entity.narrative },
    }),
  }))
}

/** One row of the Articles list page. */
export interface ArticleListRowView {
  id: string
  name: string
  type: string | null
  iconKey: LinkerIconKey
}

/** Shapes the campaign's live Articles (`loadCampaignArticles`) into the Articles list page's rows. */
export function buildArticleListView(
  articles: readonly CampaignArticleRow[]
): ArticleListRowView[] {
  return articles.map((article) => ({
    id: article.id,
    name: article.name,
    type: article.type,
    iconKey: articleIconKey(article.type),
  }))
}
