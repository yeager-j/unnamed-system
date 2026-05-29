import { eq } from "drizzle-orm"
import { cache } from "react"

import { db } from "@/lib/db"
import { loadCharacterRowByShortId } from "@/lib/db/queries/load-character"
import {
  characterArchetypes,
  type CharacterChainRow,
  type CharacterKnifeRow,
  type CharacterRow,
} from "@/lib/db/schema/character"
import { loadCharacterChains } from "@/lib/db/writes/chains"
import { loadCharacterKnives } from "@/lib/db/writes/knives"

/**
 * Per-request memoized draft loader shared by the builder route's layout,
 * index page, and step pages so the row is fetched once per render. Lives
 * outside `layout.tsx` because Next 16 restricts what a route module can
 * export.
 *
 * Includes the picked Origin Archetype's catalog key (resolved by joining
 * `characters.activeArchetypeId` to the `characterArchetype` row it points
 * at) so the Step 2 picker can mark the selected card without re-querying,
 * and the Knives + Chains child rows so Step 3 can render the repeating
 * lists without a round-trip per section.
 */
export interface BuilderCharacter extends CharacterRow {
  /** Catalog key of the row at `activeArchetypeId`, or `null` when none picked. */
  originArchetypeKey: string | null
  /** Knives rows for this character, ordered by `order`. */
  knives: CharacterKnifeRow[]
  /** Chains rows for this character, ordered by `order`. */
  chains: CharacterChainRow[]
}

export const getBuilderCharacter = cache(
  async (shortId: string): Promise<BuilderCharacter | null> => {
    const row = await loadCharacterRowByShortId(shortId)
    if (!row) return null

    const [archetypeRow, knives, chains] = await Promise.all([
      row.activeArchetypeId
        ? db
            .select({ archetypeKey: characterArchetypes.archetypeKey })
            .from(characterArchetypes)
            .where(eq(characterArchetypes.id, row.activeArchetypeId))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
      loadCharacterKnives(row.id),
      loadCharacterChains(row.id),
    ])

    return {
      ...row,
      originArchetypeKey: archetypeRow?.archetypeKey ?? null,
      knives,
      chains,
    }
  }
)
