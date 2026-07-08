import { eq } from "drizzle-orm"

import type { Equipment } from "@workspace/game-v2/items"

import { entity, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/inventory.spec.ts` (UNN-559): the Inventory tab's
 * equipment writes + wallet. Minted with one item per capability the spec
 * exercises — an equipped weapon (the remove-while-equipped case), an
 * unequipped armor with a resolve-visible effect (Bladeturn Mail's Resist
 * Slash drives the CH18 derived-stat assertion), and a stackable consumable
 * for the qty stepper.
 */
export async function createInventoryTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Pack Mule",
    items: [
      { catalogItemKey: "longsword", equipped: true },
      { catalogItemKey: "bladeturn-mail", equipped: false },
      { catalogItemKey: "soul-drop", equipped: false, quantity: 3 },
    ],
  })

  /** Reads the persisted `equipment` component (rows + wallet). */
  async function getEquipment(): Promise<Equipment | null> {
    const rows = await getDb()
      .select({ equipment: entity.equipment })
      .from(entity)
      .where(eq(entity.id, target.id))
    return rows[0]?.equipment ?? null
  }

  /** The persisted row for a catalog key (the spec asserts by key — `add`
   *  row ids are client-seeded, so the key is the stable handle). */
  async function getItemRow(catalogItemKey: string) {
    const equipment = await getEquipment()
    return (
      equipment?.items.find((item) => item.catalogItemKey === catalogItemKey) ??
      null
    )
  }

  return { ...target, getEquipment, getItemRow }
}
