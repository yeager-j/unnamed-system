import { eq } from "drizzle-orm"

import { archetypeId } from "@/lib/__fixtures__/seed-characters"
import { characterArchetypes, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/inheritance-slots.spec.ts` (UNN-241). Active
 * Archetype is Warrior, with Mage (Rank 2) and Knight (Rank 1) also unlocked so
 * the slot picker has two source Archetypes to group by and a Rank gate to
 * exercise (Mage offers its Rank 1–2 Skills; Knight only Rank 1). All three sit
 * in distinct Lineages. Minted per-run so writing `inheritanceSlots` never races.
 */
export async function createInheritanceSlotsTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Wynn Calloway",
    level: 5,
    archetypes: [
      { archetypeKey: "warrior", rank: 2 },
      { archetypeKey: "mage", rank: 2 },
      { archetypeKey: "knight", rank: 1 },
    ],
  })
  const { id, slug } = target

  /** Deterministic `characterArchetype` row id for one of this target's
   *  Archetypes — the value an inherited slot's source points at. */
  const archetypeRowId = (archetypeKey: string): string =>
    archetypeId(slug, archetypeKey)

  /** Clears every Archetype's slot configuration back to empty between tests. */
  async function reset(): Promise<void> {
    await getDb()
      .update(characterArchetypes)
      .set({ inheritanceSlots: [] })
      .where(eq(characterArchetypes.characterId, id))
  }

  /** Reads the Warrior row's persisted `inheritanceSlots` for assertions. */
  async function getWarriorSlots() {
    const [row] = await getDb()
      .select({ inheritanceSlots: characterArchetypes.inheritanceSlots })
      .from(characterArchetypes)
      .where(eq(characterArchetypes.id, archetypeRowId("warrior")))
      .limit(1)
    if (!row) throw new Error("inheritance-slots target Warrior row missing")
    return row.inheritanceSlots
  }

  return { ...target, archetypeRowId, reset, getWarriorSlots }
}
