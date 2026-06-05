import { asc, eq } from "drizzle-orm"

import { characters, getDb, inventoryItems } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

const SEED_ITEMS = [
  { catalogItemKey: "longsword", equipped: true, quantity: 1 },
  { catalogItemKey: "bladeturn-mail", equipped: false, quantity: 1 },
  { catalogItemKey: "soul-drop", equipped: false, quantity: 5 },
] as const

const STARTING_CURRENCY = 100

/**
 * Ephemeral target for `e2e/inventory.spec.ts` (UNN-223). Minted per-run so the
 * other write specs can mutate their rows in parallel without flaking these add
 * / stack / adjust / remove / currency assertions. Ships a known loadout: an
 * equipped weapon (for remove-auto-unequip), an unequipped piece of armor, and
 * a Soul Drop stack (for the quantity adjuster).
 */
export async function createInventoryTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Quill Marrow",
    items: SEED_ITEMS.map((item) => ({ ...item })),
  })
  const { id, slug } = target

  /** Restores the known loadout and currency. Replaces every inventory row
   *  rather than diffing — the spec never relies on row ids surviving a reset. */
  async function reset(): Promise<void> {
    const db = getDb()
    await db.delete(inventoryItems).where(eq(inventoryItems.characterId, id))
    await db.insert(inventoryItems).values(
      SEED_ITEMS.map((item, index) => ({
        id: `seed-item-${slug}-${item.catalogItemKey}-${index}`,
        characterId: id,
        catalogItemKey: item.catalogItemKey,
        equipped: item.equipped,
        quantity: item.quantity,
      }))
    )
    await db
      .update(characters)
      .set({ currency: STARTING_CURRENCY })
      .where(eq(characters.id, id))
  }

  /** Reads the persisted inventory rows, ordered by catalog key then id. */
  async function getItems(): Promise<
    { catalogItemKey: string; equipped: boolean; quantity: number }[]
  > {
    return getDb()
      .select({
        catalogItemKey: inventoryItems.catalogItemKey,
        equipped: inventoryItems.equipped,
        quantity: inventoryItems.quantity,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, id))
      .orderBy(asc(inventoryItems.catalogItemKey), asc(inventoryItems.id))
  }

  /** Rows for a single catalog key (e.g. all Soul Drop stacks). */
  async function getRows(
    catalogItemKey: string
  ): Promise<{ equipped: boolean; quantity: number }[]> {
    const rows = await getItems()
    return rows
      .filter((row) => row.catalogItemKey === catalogItemKey)
      .map(({ equipped, quantity }) => ({ equipped, quantity }))
  }

  /** Reads the persisted currency straight off the row. */
  async function getCurrency(): Promise<number> {
    const [row] = await getDb()
      .select({ currency: characters.currency })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1)
    if (!row) throw new Error("inventory target row missing")
    return row.currency
  }

  return { ...target, reset, getItems, getRows, getCurrency }
}
