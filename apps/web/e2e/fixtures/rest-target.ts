import { eq } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characters, getDb } from "@/lib/db"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  toStatComputationCharacter,
} from "@/lib/game/character"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/rest-dialog.spec.ts` (UNN-156). Lives in its own
 * row so the cast / write / header-actions specs can mutate their seed rows
 * in parallel without flaking these Rest assertions. Balanced path (HD d10,
 * SD d10) keeps the dice-display labels predictable in assertions.
 */
const seed = makeSeedCharacter({
  slug: "rest-target",
  shortId: "rest-target",
  name: "Mira Solberg-Rest",
  pronouns: "she/her",
})

export const restTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/**
 * Sets HP / SP below max, exhausts a couple Hit and Skill Dice, and empties
 * Prisma so each Rest variant has something to recover. The seed is
 * idempotent but mutated pools survive between specs in the same Playwright
 * run, so each Rest test starts from a known partially-spent state.
 */
export async function resetRestTarget(): Promise<void> {
  const character = await loadHydratedCharacterById(restTarget.characterId)
  if (!character) throw new Error("rest-target seed character not present")
  const stats = toStatComputationCharacter(character)
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
    .where(eq(characters.id, restTarget.characterId))
}

/** Reads the persisted pools + dice + exhaustion + prisma straight off the row. */
export async function getRestTargetState(): Promise<{
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
    .where(eq(characters.id, restTarget.characterId))
    .limit(1)
  if (!row) throw new Error("rest-target row missing")
  return row
}
