import { eq } from "drizzle-orm"

import type { SeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characters, getDb } from "@/lib/db"
import { loadHydratedCharacterById } from "@/lib/db/load-character"
import {
  computeMaxHP,
  computeMaxSP,
  toStatComputationCharacter,
} from "@/lib/game/character"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/header-owner-actions.spec.ts` (UNN-155). Lives in
 * its own row so the existing write/cast-target specs can mutate their seed
 * rows in parallel without flaking these pool-adjust assertions. Balanced
 * path Warrior R1 — the active Archetype is incidental; the spec only cares
 * about the header's HP / SP / Prisma columns.
 */
const seed: SeedCharacter = {
  slug: "header-actions-target",
  shortId: "header-actions-target",
  name: "Elara Voss",
  pronouns: "she/her",
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

export const headerActionsTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/**
 * Resets pools to max HP / max SP and refills the Prisma flask to its max
 * charges. Each header-actions spec calls this in `beforeEach` so a mutated
 * pool from a previous spec doesn't poison the next assertion.
 */
export async function resetHeaderActionsTarget(): Promise<void> {
  const character = await loadHydratedCharacterById(
    headerActionsTarget.characterId
  )
  if (!character)
    throw new Error("header-actions-target seed character not present")
  const stats = toStatComputationCharacter(character)
  await getDb()
    .update(characters)
    .set({
      currentHP: computeMaxHP(stats),
      currentSP: computeMaxSP(stats),
      prismaCharges: character.prismaMaxCharges,
    })
    .where(eq(characters.id, headerActionsTarget.characterId))
}

/** Pokes `currentHP` directly — for the Fallen-at-0 assertion path. */
export async function setHeaderActionsTargetCurrentHP(
  hp: number
): Promise<void> {
  await getDb()
    .update(characters)
    .set({ currentHP: hp })
    .where(eq(characters.id, headerActionsTarget.characterId))
}

/** Pokes `prismaCharges` directly — for the disabled-at-0 assertion path. */
export async function setHeaderActionsTargetPrismaCharges(
  charges: number
): Promise<void> {
  await getDb()
    .update(characters)
    .set({ prismaCharges: charges })
    .where(eq(characters.id, headerActionsTarget.characterId))
}

/** Reads the persisted HP/SP/Prisma straight off the row. */
export async function getHeaderActionsTargetPools(): Promise<{
  currentHP: number
  currentSP: number
  prismaCharges: number
}> {
  const [row] = await getDb()
    .select({
      currentHP: characters.currentHP,
      currentSP: characters.currentSP,
      prismaCharges: characters.prismaCharges,
    })
    .from(characters)
    .where(eq(characters.id, headerActionsTarget.characterId))
    .limit(1)
  if (!row) throw new Error("header-actions-target row missing")
  return row
}
