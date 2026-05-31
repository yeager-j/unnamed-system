import { eq } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characters, getDb } from "@/lib/db"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
import {
  computeMaxHP,
  computeMaxSP,
  toStatComputationCharacter,
} from "@/lib/game/character"

import type { E2EFixture } from "./types"

/**
 * Dedicated cast-target for `e2e/cast-skill.spec.ts`. Owned by the dev
 * user; active Archetype is Warrior at Rank 2, so the Skill list carries
 * both Cleave (5% HP cost — exercises the HP-percent branch and the "would
 * drop HP to 0" disabled tooltip) and Windblade (4 SP cost — exercises
 * the flat-SP branch). Lives in its own row so the existing `write-target`
 * write-pattern spec can mutate Mira Solberg's identity column without
 * flaking these cast assertions, and vice versa.
 */
const seed = makeSeedCharacter({
  slug: "cast-target",
  shortId: "cast-target",
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

export const castTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/**
 * Resets the cast-target's pools to the engine-derived max. The seed
 * itself is idempotent but mutated pools survive between specs in the
 * same Playwright run, so each cast test starts from a known full state.
 */
export async function resetCastTarget(): Promise<void> {
  const character = await loadHydratedCharacterById(castTarget.characterId)
  if (!character) throw new Error("cast-target seed character not present")
  const stats = toStatComputationCharacter(character)
  await getDb()
    .update(characters)
    .set({ currentHP: computeMaxHP(stats), currentSP: computeMaxSP(stats) })
    .where(eq(characters.id, castTarget.characterId))
}

/**
 * Pokes `currentHP` directly so a single Cleave (5%-HP → 1 HP at max 20)
 * would drop the character to 0 — exercises the disabled-button + tooltip
 * path without burning 19 clicks per run.
 */
export async function setCastTargetCurrentHP(hp: number): Promise<void> {
  await getDb()
    .update(characters)
    .set({ currentHP: hp })
    .where(eq(characters.id, castTarget.characterId))
}

/** Pokes `currentSP` directly — mirror of {@link setCastTargetCurrentHP}. */
export async function setCastTargetCurrentSP(sp: number): Promise<void> {
  await getDb()
    .update(characters)
    .set({ currentSP: sp })
    .where(eq(characters.id, castTarget.characterId))
}

/** Reads the persisted HP/SP straight off the row. */
export async function getCastTargetPools(): Promise<{
  currentHP: number
  currentSP: number
}> {
  const [row] = await getDb()
    .select({
      currentHP: characters.currentHP,
      currentSP: characters.currentSP,
    })
    .from(characters)
    .where(eq(characters.id, castTarget.characterId))
    .limit(1)
  if (!row) throw new Error("cast-target row missing")
  return row
}
