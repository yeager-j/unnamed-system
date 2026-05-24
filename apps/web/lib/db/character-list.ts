import { asc, eq } from "drizzle-orm"

import { db } from "./index"
import {
  characterArchetypes,
  characters,
  type CharacterStatus,
} from "./schema/character"

/**
 * Summary view of a character for the My Characters home page: just the
 * columns the card grid renders. Distinct from {@link HydratedCharacter} so
 * the list query can stay a single round-trip and never pulls JSON columns,
 * child rows, or derived stats it would not display.
 *
 * Drafts (UNN-204) appear here alongside finalized characters but the card
 * renders a distinct draft affordance; `status` and `builderStep` drive
 * that branch.
 */
export interface CharacterSummary {
  id: string
  shortId: string
  name: string
  level: number
  portraitUrl: string | null
  activeArchetypeKey: string | null
  status: CharacterStatus
  builderStep: number
}

/**
 * Every character owned by `ownerId`, ordered by most-recently-updated first.
 * A single `LEFT JOIN` on `characters.activeArchetypeId` resolves the active
 * Archetype's key in the same query, so a 50-character roster is one round
 * trip — the "no N+1" guarantee the ticket calls out.
 */
export async function loadOwnedCharacterSummaries(
  ownerId: string
): Promise<CharacterSummary[]> {
  const rows = await db
    .select({
      id: characters.id,
      shortId: characters.shortId,
      name: characters.name,
      level: characters.level,
      portraitUrl: characters.portraitUrl,
      activeArchetypeKey: characterArchetypes.archetypeKey,
      status: characters.status,
      builderStep: characters.builderStep,
    })
    .from(characters)
    .leftJoin(
      characterArchetypes,
      eq(characters.activeArchetypeId, characterArchetypes.id)
    )
    .where(eq(characters.ownerId, ownerId))
    .orderBy(asc(characters.name))

  return rows
}
