import { eq } from "drizzle-orm"
import { cache } from "react"

import { db } from "@/lib/db"
import {
  loadCharacterRowByShortId,
  type CharacterRow,
} from "@/lib/db/load-character"
import { characterArchetypes } from "@/lib/db/schema/character"

/**
 * Per-request memoized draft loader shared by the builder route's layout,
 * index page, and step pages so the row is fetched once per render. Lives
 * outside `layout.tsx` because Next 16 restricts what a route module can
 * export.
 *
 * Includes the picked Origin Archetype's catalog key (resolved by joining
 * `characters.activeArchetypeId` to the `characterArchetype` row it points
 * at) so the Step 2 picker can mark the selected card without re-querying.
 */
export interface BuilderCharacter extends CharacterRow {
  /** Catalog key of the row at `activeArchetypeId`, or `null` when none picked. */
  originArchetypeKey: string | null
}

export const getBuilderCharacter = cache(
  async (shortId: string): Promise<BuilderCharacter | null> => {
    const row = await loadCharacterRowByShortId(shortId)
    if (!row) return null

    let originArchetypeKey: string | null = null
    if (row.activeArchetypeId) {
      const [archetypeRow] = await db
        .select({ archetypeKey: characterArchetypes.archetypeKey })
        .from(characterArchetypes)
        .where(eq(characterArchetypes.id, row.activeArchetypeId))
        .limit(1)
      originArchetypeKey = archetypeRow?.archetypeKey ?? null
    }

    return { ...row, originArchetypeKey }
  }
)
