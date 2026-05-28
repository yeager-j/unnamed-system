import { eq } from "drizzle-orm"

import type { SeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characters, getDb } from "@/lib/db"
import { loadHydratedCharacterById } from "@/lib/db/load-character"
import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  toStatComputationCharacter,
} from "@/lib/game/character"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/leveling.spec.ts` (UNN-157). Lives in its own row
 * so the header-actions / write / cast specs can race with these progression
 * mutations freely. Balanced path Warrior R1 — the active Archetype is
 * incidental; the spec exercises Victories ± and the Level-up dialog.
 */
const seed: SeedCharacter = {
  slug: "leveling-target",
  shortId: "leveling-target",
  name: "Brio Levant",
  pronouns: "they/them",
  level: 1,
  pathChoice: "balanced",
  activeArchetypeKey: "warrior",
  archetypes: [
    {
      archetypeKey: "warrior",
      rank: 1,
      mechanicState: { kind: "perfection", rank: 0 },
    },
  ],
  manualBonuses: {},
  ancestryText: "",
  backgroundText: "",
  backstoryText: "",
  personalityTraits: null,
  hopes: null,
  dreams: null,
  fears: null,
  secrets: null,
  notes: "",
  knives: [],
  chains: [],
  gainedTalents: [],
  items: [],
  victories: 0,
  virtues: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
  sparkLog: [],
  exhaustion: 0,
  ailments: [],
  battleConditions: null,
  partyComposition: null,
}

export const levelingTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/**
 * Resets the row to Level 1 / Victories 0 / Saved Ranks 0 with full pools
 * and refilled Hit/Skill Dice. Each leveling spec calls this in `beforeEach`
 * so a previous test's level-up doesn't poison the next assertion.
 */
export async function resetLevelingTarget(): Promise<void> {
  const character = await loadHydratedCharacterById(levelingTarget.characterId)
  if (!character) throw new Error("leveling-target seed character not present")
  const stats = toStatComputationCharacter({ ...character, level: 1 })
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
    .where(eq(characters.id, levelingTarget.characterId))
}

/** Pokes `victories` directly — for CTA-threshold and overflow assertions. */
export async function setLevelingTargetVictories(
  victories: number
): Promise<void> {
  await getDb()
    .update(characters)
    .set({ victories })
    .where(eq(characters.id, levelingTarget.characterId))
}

/** Reads the persisted progression + dice straight off the row. */
export async function getLevelingTargetState(): Promise<{
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
    .where(eq(characters.id, levelingTarget.characterId))
    .limit(1)
  if (!row) throw new Error("leveling-target row missing")
  return row
}
