import { archetypeDisplayName } from "@workspace/game-v2/catalog/archetypes"

import type { RosterMember } from "@/lib/db/queries/load-campaign"

/** One row of the Day Runner's placed-characters sidebar. */
export interface RosterRowView {
  id: string
  shortId: string
  name: string
  portraitUrl: string | null
  subtitle: string
}

/**
 * Flattens the campaign roster (members ⋈ their placed characters) into the
 * Day Runner sidebar's rows — placed characters only, name-ordered, each with
 * the "Level 4 · Warrior" line the handoff shows (a draft still in the builder
 * reads "Draft" instead). The engine-vocab lookup stays here in the data tier;
 * the component just renders rows (UNN-610 tier rule).
 */
export function buildRosterView(roster: RosterMember[]): RosterRowView[] {
  return roster
    .flatMap((member) => member.characters)
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
