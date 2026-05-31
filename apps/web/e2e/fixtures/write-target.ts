import { eq, sql } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
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
const seed = makeSeedCharacter({
  slug: "write-target",
  shortId: "write-target",
  name: "Mira Solberg",
  items: [
    { catalogItemKey: "longsword", equipped: false },
    { catalogItemKey: "bladeturn-mail", equipped: false },
    { catalogItemKey: "zephyr-band", equipped: false },
  ],
})

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
      pronouns: seed.pronouns,
      ancestryText: seed.ancestryText,
      backgroundText: seed.backgroundText,
      portraitUrl: null,
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
