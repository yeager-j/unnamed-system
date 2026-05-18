import { and, eq } from "drizzle-orm"
import { buildStatComputationCharacter } from "../game/stat-character"
import type { StatComputationCharacter } from "../game/stats"
import { db } from "./index"
import { characterArchetypes, characters, inventoryItems } from "./schema"

/**
 * The one neutral, domain-agnostic seam every per-domain db wrapper loads
 * through. It owns the character + Archetypes + equipped-items query and the
 * pure {@link buildStatComputationCharacter} hydration so that resolution lives
 * in exactly one place — adding a new effect/bonus source can no longer drift
 * between the cast and rest domains. Domain wrappers import only from here;
 * none imports another domain.
 */

/** A `characters` table row, as returned by `select()`. */
export type CharacterRow = typeof characters.$inferSelect

/** The raw `characters` row by id, or `null` when no character matches. */
export async function loadCharacterRow(
  characterId: string
): Promise<CharacterRow | null> {
  const [row] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1)

  return row ?? null
}

/**
 * The raw persisted row merged with the derived
 * {@link StatComputationCharacter} view — one source for everything a caller
 * needs (the minimal engine-input shapes today, the whole character sheet
 * later). The intersection is well-formed: the only shared keys (`pathChoice`,
 * `level`, `manualBonuses`) are identical types in both, so no key collapses to
 * `never`.
 */
export type HydratedCharacter = CharacterRow & StatComputationCharacter

/**
 * Loads the row and assembles the derived view in one place: the
 * Rank/inheritance Skill selection and catalog resolution are done by the pure
 * {@link buildStatComputationCharacter}; this supplies the rows. Returns `null`
 * when no character has that id.
 */
export async function loadHydratedCharacter(
  characterId: string
): Promise<HydratedCharacter | null> {
  const row = await loadCharacterRow(characterId)
  if (!row) return null

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

  const stats = buildStatComputationCharacter(
    {
      pathChoice: row.pathChoice,
      level: row.level,
      manualBonuses: row.manualBonuses,
      activeCharacterArchetypeId: row.activeArchetypeId,
    },
    archetypeRows.map((archetype) => ({
      id: archetype.id,
      archetypeKey: archetype.archetypeKey,
      rank: archetype.rank,
      inheritanceSlots: archetype.inheritanceSlots,
    })),
    equippedRows.map((item) => item.catalogItemKey)
  )

  return { ...row, ...stats }
}
