import type { Lineage } from "@workspace/game-v2/kernel/vocab"

import type { LoadedCampaignNpc } from "@/lib/db/queries/load-campaign-world"
import type { CampaignArticleRow } from "@/lib/db/schema/campaign-world"

import { isStubNpc } from "../npc"
import { articleIconKey, npcTraitsLabel, type LinkerIconKey } from "./linker"
import type { WorldTreeItem } from "./world-tree"

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

/** Shapes live NPCs into the D11 tree's item leaves (`buildWorldForest` input). */
export function buildNpcTreeItems(
  npcs: readonly LoadedCampaignNpc[]
): WorldTreeItem[] {
  return npcs.map((npc) => ({
    id: npc.entityId,
    folderId: npc.folderId,
    name: npc.entity.name,
    iconKey: "npc",
    isStub: isStubNpc({
      arcana: npc.arcana,
      lineageKey: npc.lineageKey,
      entity: { narrative: npc.entity.narrative },
    }),
  }))
}

/** Shapes live Articles into the D11 tree's item leaves (`buildWorldForest` input). */
export function buildArticleTreeItems(
  articles: readonly CampaignArticleRow[]
): WorldTreeItem[] {
  return articles.map((article) => ({
    id: article.id,
    folderId: article.folderId,
    name: article.name,
    iconKey: articleIconKey(article.type),
    type: article.type,
  }))
}

/**
 * Lineage → holder name over the live NPCs — the Lineage picker's
 * disabled-with-holder rows (D8's hard-unique lane read straight off the
 * list the layout already loads).
 */
export function lineageHolders(
  npcs: readonly LoadedCampaignNpc[]
): ReadonlyMap<Lineage, string> {
  const holders = new Map<Lineage, string>()
  for (const npc of npcs) {
    if (npc.lineageKey !== null) holders.set(npc.lineageKey, npc.entity.name)
  }
  return holders
}

/**
 * Arcana label → holder name over the live NPCs — the Arcana picker's
 * advisory "held by ⟨name⟩" rows (D8: warns, never blocks). First holder
 * wins as the displayed name; duplicates are legal.
 */
export function arcanaHolders(
  npcs: readonly LoadedCampaignNpc[]
): ReadonlyMap<string, string> {
  const holders = new Map<string, string>()
  for (const npc of npcs) {
    if (npc.arcana !== null && !holders.has(npc.arcana)) {
      holders.set(npc.arcana, npc.entity.name)
    }
  }
  return holders
}

/** The campaign's distinct article types, sorted — the tree's filter chips. */
export function articleTypeOptions(
  articles: readonly CampaignArticleRow[]
): string[] {
  const types = new Set<string>()
  for (const article of articles) {
    const type = article.type?.trim()
    if (type !== undefined && type !== "") types.add(type)
  }
  return [...types].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  )
}
