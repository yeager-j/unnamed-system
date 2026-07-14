import { archetypeDisplayName } from "@workspace/game-v2/catalog/archetypes"

import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { LoadedCampaignNpc } from "@/lib/db/queries/load-campaign-world"
import type { CampaignArticleRow } from "@/lib/db/schema/campaign-world"
import type { DungeonStatus } from "@/lib/db/schema/dungeon"
import type { EncounterStatus } from "@/lib/db/schema/encounter"

import {
  DUNGEON_STATUS_LABELS,
  ENCOUNTER_STATUS_LABELS,
  LINEAGE_LABELS,
} from "../../labels"
import type { ParticipantRef } from "../participant"

/** Which glyph a linker row leads with — NPC mask, character user, an article's type icon, or a combat surface's kind icon. */
export type LinkerIconKey =
  | "npc"
  | "character"
  | "article"
  | "settlement"
  | "faction"
  | "encounter"
  | "dungeon"

/** One searchable row of the participant linker's "From the world web" list. */
export interface LinkerOption {
  ref: ParticipantRef
  label: string
  /** The right-aligned muted line: "The Moon · Warlock", an article's type, "Level 4 · Warrior". Null for stubs. */
  sublabel: string | null
  iconKey: LinkerIconKey
  /**
   * The URL short id, carried alongside refs whose durable id is not the URL
   * slug (characters route by sheet shortId; encounters/dungeons by console
   * shortId). Unset for kinds whose ref id is the URL id (NPCs, articles).
   */
  shortId?: string
}

/** The list-row shape the encounter/dungeon linker inputs share: `(id, shortId, name, status)`. */
export interface CombatSurfaceSummary<Status extends string> {
  id: string
  shortId: string
  name: string
  status: Status
}

const ARTICLE_TYPE_ICONS: Record<string, LinkerIconKey> = {
  settlement: "settlement",
  city: "settlement",
  town: "settlement",
  village: "settlement",
  place: "settlement",
  location: "settlement",
  faction: "faction",
  guild: "faction",
  order: "faction",
  organization: "faction",
}

/**
 * Shapes the campaign's live world things into the linker's option rows
 * (UNN-575, handoff "entity linker"): NPCs first, then Articles, then placed
 * characters, then encounters and dungeons (UNN-624 full participant kinds),
 * each with its kind icon and subtitle. Engine-vocab lookups (Lineage labels,
 * Archetype names) stay here in the data tier — the component just renders
 * rows (UNN-610 tier rule). Any input list may be empty; phase-2 mounts pass
 * no characters.
 */
export function buildLinkerOptions(input: {
  npcs: readonly LoadedCampaignNpc[]
  articles: readonly CampaignArticleRow[]
  characters?: readonly CharacterSummary[]
  encounters?: readonly CombatSurfaceSummary<EncounterStatus>[]
  dungeons?: readonly CombatSurfaceSummary<DungeonStatus>[]
}): LinkerOption[] {
  const npcOptions = input.npcs.map(
    (npc): LinkerOption => ({
      ref: { kind: "npc", id: npc.entityId, label: npc.entity.name },
      label: npc.entity.name,
      sublabel: npcTraitsLabel(npc),
      iconKey: "npc",
    })
  )
  const articleOptions = input.articles.map(
    (article): LinkerOption => ({
      ref: { kind: "article", id: article.id, label: article.name },
      label: article.name,
      sublabel: article.type,
      iconKey: articleIconKey(article.type),
    })
  )
  const characterOptions = (input.characters ?? []).map(
    (character): LinkerOption => ({
      ref: { kind: "character", id: character.id, label: character.name },
      label: character.name,
      sublabel: characterTraitsLabel(character),
      iconKey: "character",
      shortId: character.shortId,
    })
  )
  const encounterOptions = (input.encounters ?? []).map(
    (encounter): LinkerOption => ({
      ref: { kind: "encounter", id: encounter.id, label: encounter.name },
      label: encounter.name,
      sublabel: ENCOUNTER_STATUS_LABELS[encounter.status],
      iconKey: "encounter",
      shortId: encounter.shortId,
    })
  )
  const dungeonOptions = (input.dungeons ?? []).map(
    (dungeon): LinkerOption => ({
      ref: { kind: "dungeon", id: dungeon.id, label: dungeon.name },
      label: dungeon.name,
      sublabel: DUNGEON_STATUS_LABELS[dungeon.status],
      iconKey: "dungeon",
      shortId: dungeon.shortId,
    })
  )
  return [
    ...npcOptions,
    ...articleOptions,
    ...characterOptions,
    ...encounterOptions,
    ...dungeonOptions,
  ]
}

/**
 * The in-memory option filter the editor's participant-link completions use
 * (UNN-576): case-insensitive substring match over label + sublabel — the
 * same fields cmdk scores inside the anchored linker, minus the fuzz. Pure;
 * an empty query returns everything (the completion source caps display itself).
 */
export function filterLinkerOptions(
  options: readonly LinkerOption[],
  query: string
): LinkerOption[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") return [...options]
  return options.filter((option) =>
    `${option.label} ${option.sublabel ?? ""}`.toLowerCase().includes(needle)
  )
}

/** "Level 4 · Warrior" — a placed character's traits line; drafts say so. */
export function characterTraitsLabel(character: {
  status: CharacterSummary["status"]
  level: number
  activeArchetypeKey: string | null
}): string {
  if (character.status === "draft") return "Draft"
  return `Level ${character.level} · ${archetypeDisplayName(character.activeArchetypeKey)}`
}

/** "The Moon · Warlock" — whichever traits exist, joined; null for a stub. */
export function npcTraitsLabel(npc: {
  arcana: string | null
  lineageKey: LoadedCampaignNpc["lineageKey"]
}): string | null {
  const parts = [
    npc.arcana,
    npc.lineageKey === null ? null : LINEAGE_LABELS[npc.lineageKey],
  ].filter((part): part is string => part !== null)
  return parts.length === 0 ? null : parts.join(" · ")
}

/** The glyph for an article's label-only `type` — a curated map, `article` (scroll) otherwise. */
export function articleIconKey(type: string | null): LinkerIconKey {
  if (type === null) return "article"
  return ARTICLE_TYPE_ICONS[type.trim().toLowerCase()] ?? "article"
}
