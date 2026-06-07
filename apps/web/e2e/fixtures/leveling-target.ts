import { eq } from "drizzle-orm"

import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  toStatContext,
} from "@workspace/game/engine"

import { characters, getDb } from "@/lib/db"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/leveling.spec.ts` (UNN-157). Minted per-run so the
 * header-actions / cast / write specs can race with these progression mutations
 * freely. Balanced path Warrior R1 — the active Archetype is incidental; the
 * spec exercises Victories ± and the Level-up dialog.
 */
export async function createLevelingTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, { name: "Brio Levant" })
  const { id } = target

  /** Resets the row to Level 1 / Victories 0 / Saved Ranks 0 with full pools
   *  and refilled Hit/Skill Dice. */
  async function reset(): Promise<void> {
    const character = await loadHydratedCharacterById(id)
    if (!character) throw new Error("leveling target character not present")
    const stats = toStatContext({ ...character, level: 1 })
    await getDb()
      .update(characters)
      .set({
        level: 1,
        victories: 0,
        savedArchetypeRanks: 0,
        currentHP: computeMaxHP(stats),
        currentSP: computeMaxSP(stats),
        hitDiceRemaining: computeMaxHitDice(1),
        skillDiceRemaining: computeMaxSkillDice(1),
      })
      .where(eq(characters.id, id))
  }

  /** Pokes `victories` directly — for CTA-threshold and overflow assertions. */
  async function setVictories(victories: number): Promise<void> {
    await getDb()
      .update(characters)
      .set({ victories })
      .where(eq(characters.id, id))
  }

  /** Reads the persisted progression + dice straight off the row. */
  async function getState(): Promise<{
    level: number
    victories: number
    savedArchetypeRanks: number
    hitDiceRemaining: number
    skillDiceRemaining: number
    currentHP: number
    currentSP: number
  }> {
    const [row] = await getDb()
      .select({
        level: characters.level,
        victories: characters.victories,
        savedArchetypeRanks: characters.savedArchetypeRanks,
        hitDiceRemaining: characters.hitDiceRemaining,
        skillDiceRemaining: characters.skillDiceRemaining,
        currentHP: characters.currentHP,
        currentSP: characters.currentSP,
      })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1)
    if (!row) throw new Error("leveling target row missing")
    return row
  }

  return { ...target, reset, setVictories, getState }
}
