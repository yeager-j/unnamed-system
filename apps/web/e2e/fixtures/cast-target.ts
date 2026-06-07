import { eq } from "drizzle-orm"

import {
  computeMaxHP,
  computeMaxSP,
  toStatContext,
} from "@workspace/game/engine"

import { characters, getDb } from "@/lib/db"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral cast-target for `e2e/cast-skill.spec.ts` (UNN-225). Active Archetype
 * is Warrior at Rank 2, so the Skill list carries both Cleave (5% HP cost —
 * exercises the HP-percent branch and the "would drop HP to 0" disabled tooltip)
 * and Windblade (4 SP cost — exercises the flat-SP branch). Minted per-run so
 * its pools can be poked without racing any other worker.
 */
export async function createCastTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Cassia Vance",
    pronouns: "she/her",
    archetypes: [
      {
        archetypeKey: "warrior",
        rank: 2,
        mechanicState: { kind: "perfection", rank: 0 },
      },
    ],
  })
  const { id } = target

  /** Resets the pools to the engine-derived max so each cast test starts full. */
  async function reset(): Promise<void> {
    const character = await loadHydratedCharacterById(id)
    if (!character) throw new Error("cast target character not present")
    const stats = toStatContext(character)
    await getDb()
      .update(characters)
      .set({ currentHP: computeMaxHP(stats), currentSP: computeMaxSP(stats) })
      .where(eq(characters.id, id))
  }

  /** Pokes `currentHP` directly so a single Cleave would drop to 0 — exercises
   *  the disabled-button + tooltip path without burning clicks. */
  async function setCurrentHP(hp: number): Promise<void> {
    await getDb()
      .update(characters)
      .set({ currentHP: hp })
      .where(eq(characters.id, id))
  }

  /** Pokes `currentSP` directly — mirror of {@link setCurrentHP}. */
  async function setCurrentSP(sp: number): Promise<void> {
    await getDb()
      .update(characters)
      .set({ currentSP: sp })
      .where(eq(characters.id, id))
  }

  /** Reads the persisted HP/SP straight off the row. */
  async function getPools(): Promise<{ currentHP: number; currentSP: number }> {
    const [row] = await getDb()
      .select({
        currentHP: characters.currentHP,
        currentSP: characters.currentSP,
      })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1)
    if (!row) throw new Error("cast target row missing")
    return row
  }

  return { ...target, reset, setCurrentHP, setCurrentSP, getPools }
}
