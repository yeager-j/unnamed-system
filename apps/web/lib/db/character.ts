import { and, eq } from "drizzle-orm"
import { buildStatComputationCharacter } from "../game/stat-character"
import type { StatComputationCharacter } from "../game/stats"
import { db } from "./index"
import { characterArchetypes, characters, inventoryItems } from "./schema"

/**
 * Loads a character's persisted state and assembles the pure
 * {@link StatComputationCharacter} the derived-value engine consumes. The
 * Rank/inheritance Skill selection and catalog resolution are done by the pure
 * {@link buildStatComputationCharacter}; this wrapper only supplies the rows.
 * Returns `null` when no character has that id.
 */
export async function loadStatComputationCharacter(
  characterId: string
): Promise<StatComputationCharacter | null> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  if (!character) return null

  const [archetypeRows, equippedRows] = await Promise.all([
    db
      .select()
      .from(characterArchetypes)
      .where(eq(characterArchetypes.characterId, characterId)),
    db
      .select({ catalogItemKey: inventoryItems.catalogItemKey })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.characterId, characterId),
          eq(inventoryItems.equipped, true)
        )
      ),
  ])

  return buildStatComputationCharacter(
    {
      pathChoice: character.pathChoice,
      level: character.level,
      manualBonuses: character.manualBonuses,
      activeCharacterArchetypeId: character.activeArchetypeId,
    },
    archetypeRows.map((row) => ({
      id: row.id,
      archetypeKey: row.archetypeKey,
      rank: row.rank,
      inheritanceSlots: row.inheritanceSlots,
    })),
    equippedRows.map((row) => row.catalogItemKey)
  )
}
