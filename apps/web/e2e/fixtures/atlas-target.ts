import { eq } from "drizzle-orm"

import { entity, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/archetype-atlas.spec.ts` (UNN-239). Active Archetype
 * is Warrior at **Rank 4** (so one rank-up reaches Rank 5 and Mastery), with
 * **3 Saved Archetype Ranks** to spend. No other Archetype is unlocked, so its
 * sibling Lineages start Unlockable. Minted per-run so the Rank-spend mutations
 * never race a parallel worker.
 *
 * S3 (UNN-561) re-pointed the Atlas write onto the v2 entity door, so the roster
 * + Saved Ranks now live on the `entity.archetypes` jsonb — these helpers
 * read/write that home (the v1 `characterArchetypes` child table no longer
 * backs the surface).
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
  const { id } = target

  const seedArchetypes = {
    active: "warrior",
    origin: "warrior",
    savedArchetypeRanks: 3,
    roster: [{ key: "warrior", rank: 4, inheritanceSlots: [] }],
  }

  async function currentArchetypes() {
    const [row] = await getDb()
      .select({ archetypes: entity.archetypes })
      .from(entity)
      .where(eq(entity.id, id))
      .limit(1)
    if (!row?.archetypes) throw new Error("atlas target entity row missing")
    return row.archetypes
  }

  /** Resets the target to its seed board: drops every Archetype but Warrior,
   *  restores Warrior to Rank 4, and refills Saved Ranks to 3. */
  async function reset(): Promise<void> {
    await getDb()
      .update(entity)
      .set({ archetypes: seedArchetypes })
      .where(eq(entity.id, id))
  }

  /** Sets the target's Saved Ranks (e.g. 0, to assert the disabled state). */
  async function setSavedRanks(value: number): Promise<void> {
    const archetypes = await currentArchetypes()
    await getDb()
      .update(entity)
      .set({ archetypes: { ...archetypes, savedArchetypeRanks: value } })
      .where(eq(entity.id, id))
  }

  /** Reads the persisted Archetype roster (key + rank) for assertions. */
  async function getArchetypes() {
    const archetypes = await currentArchetypes()
    return archetypes.roster.map((entry) => ({
      archetypeKey: entry.key,
      rank: entry.rank,
    }))
  }

  /** Reads the persisted Saved Ranks for assertions. */
  async function getSavedRanks(): Promise<number> {
    return (await currentArchetypes()).savedArchetypeRanks
  }

  return { ...target, reset, setSavedRanks, getArchetypes, getSavedRanks }
}
