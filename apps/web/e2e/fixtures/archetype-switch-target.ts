import { eq } from "drizzle-orm"

import { archetypeId } from "@/lib/__fixtures__/seed-characters"
import { characters, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/archetype-switch.spec.ts` (UNN-238). Active Archetype
 * is Warrior at Rank 2, with Mage (Rank 1) and Knight (Rank 1) also unlocked so
 * the header switcher has something to switch to. The three sit in distinct
 * Lineages (per-Lineage grouping) and carry distinct Ranks (the per-option
 * detail line). Minted per-run so re-pointing `activeArchetypeId` never races.
 *
 * Warrior → Mage is the witness pair: Strength flips +2 → −1, Magic flips
 * −1 → +2, Ice goes Neutral → Resist, and the Mechanic widget swaps
 * Perfection → Stains.
 */
export async function createArchetypeSwitchTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Pell Aldaric",
    level: 5,
    archetypes: [
      { archetypeKey: "warrior", rank: 2 },
      { archetypeKey: "mage", rank: 1 },
      { archetypeKey: "knight", rank: 1 },
    ],
  })
  const { id, slug } = target

  /** Deterministic `characterArchetype` row id for one of this target's
   *  Archetypes — the value `activeArchetypeId` points at. */
  const archetypeRowId = (archetypeKey: string): string =>
    archetypeId(slug, archetypeKey)

  /** Resets the active Archetype back to Warrior between tests. */
  async function reset(): Promise<void> {
    await getDb()
      .update(characters)
      .set({ activeArchetypeId: archetypeRowId("warrior") })
      .where(eq(characters.id, id))
  }

  /** Reads the persisted `activeArchetypeId` straight off the character row. */
  async function getActiveArchetypeId(): Promise<string | null> {
    const [row] = await getDb()
      .select({ activeArchetypeId: characters.activeArchetypeId })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1)
    if (!row) throw new Error("archetype-switch target character row missing")
    return row.activeArchetypeId
  }

  return { ...target, archetypeRowId, reset, getActiveArchetypeId }
}
