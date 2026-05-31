import { and, eq, ne } from "drizzle-orm"

import {
  archetypeId,
  makeSeedCharacter,
} from "@/lib/__fixtures__/seed-characters"
import { characterArchetypes, characters, getDb } from "@/lib/db"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/archetype-atlas.spec.ts` (UNN-239). Owned by the
 * dev user. Active Archetype is Warrior at **Rank 4** (so one rank-up reaches
 * Rank 5 and Mastery), with **3 Saved Archetype Ranks** to spend. No other
 * Archetype is unlocked, so its sibling Lineages (Mage, Healer, …) start
 * Unlockable for the unlock flow.
 *
 * Its own row because the spec spends Ranks and mutates the roster; sharing
 * another write target would race under Playwright's `fullyParallel`.
 */
const seed = makeSeedCharacter({
  slug: "atlas-target",
  shortId: "atlas-target",
  name: "Dorian Mercer",
  pronouns: "he/him",
  level: 12,
  pathChoice: "skill-focused",
  archetypes: [{ archetypeKey: "warrior", rank: 4 }],
  savedArchetypeRanks: 3,
})

export const atlasTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

export const atlasTargetWarriorId = archetypeId(seed.slug, "warrior")

/**
 * Resets the target to its seed board between tests: drops every Archetype but
 * Warrior, restores Warrior to Rank 4, and refills Saved Ranks to 3 — so the
 * `fullyParallel`-serial spec starts each case from a clean, spendable state.
 */
export async function resetAtlasTarget(): Promise<void> {
  const db = getDb()
  await db
    .delete(characterArchetypes)
    .where(
      and(
        eq(characterArchetypes.characterId, atlasTarget.characterId),
        ne(characterArchetypes.archetypeKey, "warrior")
      )
    )
  await db
    .update(characterArchetypes)
    .set({ rank: 4 })
    .where(eq(characterArchetypes.id, atlasTargetWarriorId))
  await db
    .update(characters)
    .set({ savedArchetypeRanks: 3 })
    .where(eq(characters.id, atlasTarget.characterId))
}

/** Sets the target's Saved Ranks (e.g. 0, to assert the disabled state). */
export async function setAtlasTargetSavedRanks(value: number): Promise<void> {
  await getDb()
    .update(characters)
    .set({ savedArchetypeRanks: value })
    .where(eq(characters.id, atlasTarget.characterId))
}

/** Reads the persisted Archetype rows (key + rank) for assertions. */
export async function getAtlasTargetArchetypes() {
  return getDb()
    .select({
      archetypeKey: characterArchetypes.archetypeKey,
      rank: characterArchetypes.rank,
    })
    .from(characterArchetypes)
    .where(eq(characterArchetypes.characterId, atlasTarget.characterId))
}

/** Reads the persisted Saved Ranks for assertions. */
export async function getAtlasTargetSavedRanks(): Promise<number> {
  const [row] = await getDb()
    .select({ savedArchetypeRanks: characters.savedArchetypeRanks })
    .from(characters)
    .where(eq(characters.id, atlasTarget.characterId))
    .limit(1)
  if (!row) throw new Error("atlas-target row missing")
  return row.savedArchetypeRanks
}
