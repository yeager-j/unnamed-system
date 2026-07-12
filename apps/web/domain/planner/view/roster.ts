import { archetypeDisplayName } from "@workspace/game-v2/catalog/archetypes"

import type { CharacterSummary } from "@/lib/db/queries/character-list"

/** One row of the Day Runner's placed-characters sidebar. */
export interface RosterRowView {
  id: string
  shortId: string
  name: string
  portraitUrl: string | null
  subtitle: string
}

/**
 * Shapes the campaign's placed characters (`loadPlacedCharactersForCampaign`)
 * into the Day Runner sidebar's rows — each with the "Level 4 · Warrior" line
 * the handoff shows. Deliberately fed by the placed-characters query, not the
 * member roster: the member grouping drops characters whose owner isn't a
 * `campaignUsers` row, and the DM's own placed PC is exactly that case (the
 * Codex review on PR #335 caught it). The engine-vocab lookup stays here in
 * the data tier; the component just renders rows (UNN-610 tier rule).
 */
export function buildRosterView(
  characters: CharacterSummary[]
): RosterRowView[] {
  return characters
    .map((character) => ({
      id: character.id,
      shortId: character.shortId,
      name: character.name,
      portraitUrl: character.portraitUrl,
      subtitle:
        character.status === "draft"
          ? "Draft"
          : `Level ${character.level} · ${archetypeDisplayName(character.activeArchetypeKey)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
