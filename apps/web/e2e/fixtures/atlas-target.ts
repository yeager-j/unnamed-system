import { and, eq, ne } from "drizzle-orm"

import { archetypeId } from "@/lib/__fixtures__/seed-characters"
import { characterArchetypes, characters, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/archetype-atlas.spec.ts` (UNN-239). Active Archetype
 * is Warrior at **Rank 4** (so one rank-up reaches Rank 5 and Mastery), with
 * **3 Saved Archetype Ranks** to spend. No other Archetype is unlocked, so its
 * sibling Lineages start Unlockable. Minted per-run so the Rank-spend mutations
 * never race a parallel worker.
 */
export async function createAtlasTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Dorian Mercer",
    pronouns: "he/him",
    level: 12,
    pathChoice: "skill-focused",
    archetypes: [{ archetypeKey: "warrior", rank: 4 }],
    savedArchetypeRanks: 3,
  })
  const { id, slug } = target
  const warriorId = archetypeId(slug, "warrior")

  /** Resets the target to its seed board: drops every Archetype but Warrior,
   *  restores Warrior to Rank 4, and refills Saved Ranks to 3. */
  async function reset(): Promise<void> {
    const db = getDb()
    await db
      .delete(characterArchetypes)
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          ne(characterArchetypes.archetypeKey, "warrior")
        )
      )
    await db
      .update(characterArchetypes)
      .set({ rank: 4 })
      .where(eq(characterArchetypes.id, warriorId))
    await db
      .update(characters)
      .set({ savedArchetypeRanks: 3 })
      .where(eq(characters.id, id))
  }

  /** Sets the target's Saved Ranks (e.g. 0, to assert the disabled state). */
  async function setSavedRanks(value: number): Promise<void> {
    await getDb()
      .update(characters)
      .set({ savedArchetypeRanks: value })
      .where(eq(characters.id, id))
  }

  /** Reads the persisted Archetype rows (key + rank) for assertions. */
  async function getArchetypes() {
    return getDb()
      .select({
        archetypeKey: characterArchetypes.archetypeKey,
        rank: characterArchetypes.rank,
      })
      .from(characterArchetypes)
      .where(eq(characterArchetypes.characterId, id))
  }

  /** Reads the persisted Saved Ranks for assertions. */
  async function getSavedRanks(): Promise<number> {
    const [row] = await getDb()
      .select({ savedArchetypeRanks: characters.savedArchetypeRanks })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1)
    if (!row) throw new Error("atlas target row missing")
    return row.savedArchetypeRanks
  }

  return { ...target, reset, setSavedRanks, getArchetypes, getSavedRanks }
}
