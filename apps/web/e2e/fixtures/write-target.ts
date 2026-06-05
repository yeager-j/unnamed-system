import { and, eq, sql } from "drizzle-orm"

import { characters, getDb, inventoryItems } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral write-target for `e2e/write-pattern.spec.ts`. Carries the three
 * inventory items the equip tests need and mirrors a Warrior baseline so the
 * Slash-affinity assertions read predictably. Minted per-run so write specs can
 * mutate freely without flaking the read-only specs that pin Iris Vey.
 */
export async function createWriteTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Mira Solberg",
    items: [
      { catalogItemKey: "longsword", equipped: false },
      { catalogItemKey: "bladeturn-mail", equipped: false },
      { catalogItemKey: "zephyr-band", equipped: false },
    ],
  })
  const { id } = target

  /** Resets the identity / progression columns and clears equipped state, so
   *  each test starts from a known baseline. */
  async function reset(): Promise<void> {
    const db = getDb()
    await db
      .update(characters)
      .set({
        name: target.name,
        pronouns: "they/them",
        ancestryText: "",
        backgroundText: "",
        portraitUrl: null,
        gainedTalents: [],
        sparkLog: [],
        virtueExpression: 0,
        virtueEmpathy: 0,
        virtueWisdom: 0,
        virtueFocus: 0,
      })
      .where(eq(characters.id, id))
    await db
      .update(inventoryItems)
      .set({ equipped: false })
      .where(eq(inventoryItems.characterId, id))
  }

  /**
   * Bumps `identityVersion` directly — simulates "a sibling tab / another writer
   * landed an identity-class write between page load and the user's edit", so
   * the next save sees its `expectedVersion` mismatch and `"stale"` surfaces
   * (the UNN-203 silent-retry path).
   */
  async function bumpIdentityVersion(): Promise<void> {
    await getDb()
      .update(characters)
      .set({ identityVersion: sql`${characters.identityVersion} + 1` })
      .where(eq(characters.id, id))
  }

  /** Sets a catalog item's equipped state directly — isolates the unequip
   *  contract from the equip contract. */
  async function setItemEquipped(
    catalogItemKey: string,
    equipped: boolean
  ): Promise<void> {
    await getDb()
      .update(inventoryItems)
      .set({ equipped })
      .where(
        and(
          eq(inventoryItems.characterId, id),
          eq(inventoryItems.catalogItemKey, catalogItemKey)
        )
      )
  }

  return { ...target, reset, bumpIdentityVersion, setItemEquipped }
}
