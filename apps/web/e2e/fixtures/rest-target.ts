import { eq } from "drizzle-orm"

import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
} from "@workspace/game/engine"

import { characters, getDb } from "@/lib/db"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
import { toStatContext } from "@/lib/game-engine"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/rest-dialog.spec.ts` (UNN-156). Minted per-run so
 * the cast / write / header-actions specs can mutate their rows in parallel
 * without flaking these Rest assertions. Balanced path (HD d10, SD d10) keeps
 * the dice-display labels predictable in assertions.
 */
export async function createRestTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Mira Solberg-Rest",
    pronouns: "she/her",
  })
  const { id } = target

  /** Sets HP / SP below max, exhausts a couple Hit and Skill Dice, and empties
   *  Prisma so each Rest variant has something to recover. */
  async function reset(): Promise<void> {
    const character = await loadHydratedCharacterById(id)
    if (!character) throw new Error("rest target character not present")
    const stats = toStatContext(character)
    const maxHP = computeMaxHP(stats)
    const maxSP = computeMaxSP(stats)
    const maxHD = computeMaxHitDice(character.level)
    const maxSD = computeMaxSkillDice(character.level)
    await getDb()
      .update(characters)
      .set({
        currentHP: Math.max(1, maxHP - 5),
        currentSP: Math.max(0, maxSP - 20),
        hitDiceRemaining: Math.max(0, maxHD - 1),
        skillDiceRemaining: Math.max(0, maxSD - 2),
        exhaustion: 1,
        prismaCharges: 0,
      })
      .where(eq(characters.id, id))
  }

  /** Reads the persisted pools + dice + exhaustion + prisma straight off the row. */
  async function getState(): Promise<{
    currentHP: number
    currentSP: number
    hitDiceRemaining: number
    skillDiceRemaining: number
    exhaustion: number
    prismaCharges: number
  }> {
    const [row] = await getDb()
      .select({
        currentHP: characters.currentHP,
        currentSP: characters.currentSP,
        hitDiceRemaining: characters.hitDiceRemaining,
        skillDiceRemaining: characters.skillDiceRemaining,
        exhaustion: characters.exhaustion,
        prismaCharges: characters.prismaCharges,
      })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1)
    if (!row) throw new Error("rest target row missing")
    return row
  }

  return { ...target, reset, getState }
}
