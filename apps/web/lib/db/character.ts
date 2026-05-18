import { and, eq } from "drizzle-orm"
import type { CastingCharacter } from "../game/skill-cost"
import { buildStatComputationCharacter } from "../game/stat-character"
import { db } from "./index"
import { characterArchetypes, characters, inventoryItems } from "./schema"

/**
 * Loads a character's persisted state and assembles the
 * {@link CastingCharacter} the derived-value engine and cast pre-check
 * consume: the pure derived-value view plus the live `currentHP`/`currentSP`
 * pools. The Rank/inheritance Skill selection and catalog resolution are done
 * by the pure {@link buildStatComputationCharacter}; this wrapper supplies the
 * rows and attaches the tracked pools. Returns `null` when no character has
 * that id.
 */
export async function loadStatComputationCharacter(
  characterId: string
): Promise<CastingCharacter | null> {
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

  return {
    ...buildStatComputationCharacter(
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
    ),
    currentHP: character.currentHP,
    currentSP: character.currentSP,
  }
}
