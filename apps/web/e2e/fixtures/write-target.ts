import { eq, sql } from "drizzle-orm"

import type { SeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characters, getDb, inventoryItems } from "@/lib/db"

import type { E2EFixture } from "./types"

/**
 * Dedicated write-target for `e2e/write-pattern.spec.ts`. Owned by the
 * dev user (`claude@unnamed-system.local`) so the existing auth fixture
 * can drive it; carries the three inventory items the equip tests need;
 * mirrors Iris Vey's archetype so the Slash-affinity assertions read the
 * same baseline. Lives in its own row so write specs can mutate freely
 * without flaking the read-only specs that pin Iris Vey's name and
 * inventory.
 */
const seed: SeedCharacter = {
  slug: "write-target",
  shortId: "write-target",
  name: "Mira Solberg",
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
  items: [
    { catalogItemKey: "longsword", equipped: false },
    { catalogItemKey: "bladeturn-mail", equipped: false },
    { catalogItemKey: "zephyr-band", equipped: false },
  ],
  victories: 0,
  virtues: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
  sparkLog: [],
  exhaustion: 0,
  ailments: [],
  battleConditions: null,
  partyComposition: null,
}

export const writeTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/**
 * Resets the write-target row's identity / progression columns and clears
 * any equipped state, so each test starts from a known baseline. Called
 * from `write-pattern.spec.ts#beforeEach`.
 */
export async function resetWriteTarget(): Promise<void> {
  const db = getDb()
  await db
    .update(characters)
    .set({
      name: seed.name,
      gainedTalents: [],
      sparkLog: [],
      virtueExpression: 0,
      virtueEmpathy: 0,
      virtueWisdom: 0,
      virtueFocus: 0,
    })
    .where(eq(characters.id, writeTarget.characterId))
  await db
    .update(inventoryItems)
    .set({ equipped: false })
    .where(eq(inventoryItems.characterId, writeTarget.characterId))
}

/**
 * Bumps `identityVersion` directly via the DB — simulates "a sibling tab /
 * another writer landed an identity-class write between page load and the
 * user's edit." The next save from the page will see its `expectedVersion`
 * mismatch and `"stale"` will surface from the wrapper, exercising the
 * UNN-203 silent-retry path.
 */
export async function bumpWriteTargetIdentityVersion(): Promise<void> {
  const db = getDb()
  await db
    .update(characters)
    .set({ identityVersion: sql`${characters.identityVersion} + 1` })
    .where(eq(characters.id, writeTarget.characterId))
}
