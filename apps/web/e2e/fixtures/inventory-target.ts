import { asc, eq } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characters, getDb, inventoryItems } from "@/lib/db"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/inventory.spec.ts` (UNN-223). Lives in its own row
 * so the other write specs can mutate their seed rows in parallel without
 * flaking these add / stack / adjust / remove / currency assertions. Ships a
 * known loadout: an equipped weapon (for remove-auto-unequip), an unequipped
 * piece of armor, and a Soul Drop stack (for the quantity adjuster).
 */
const SEED_ITEMS = [
  { catalogItemKey: "longsword", equipped: true, quantity: 1 },
  { catalogItemKey: "bladeturn-mail", equipped: false, quantity: 1 },
  { catalogItemKey: "soul-drop", equipped: false, quantity: 5 },
] as const

const STARTING_CURRENCY = 100

const seed = makeSeedCharacter({
  slug: "inventory-target",
  shortId: "inventory-target",
  name: "Quill Marrow",
  items: SEED_ITEMS.map((item) => ({ ...item })),
})

export const inventoryTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/**
 * Restores the known loadout and currency. Each inventory spec calls this in
 * `beforeEach` so a previous spec's add / remove / adjust doesn't poison the
 * next assertion. Replaces every inventory row rather than diffing — the spec
 * never relies on row ids surviving a reset.
 */
export async function resetInventoryTarget(): Promise<void> {
  const db = getDb()
  await db
    .delete(inventoryItems)
    .where(eq(inventoryItems.characterId, inventoryTarget.characterId))
  await db.insert(inventoryItems).values(
    SEED_ITEMS.map((item, index) => ({
      id: `seed-item-${seed.slug}-${item.catalogItemKey}-${index}`,
      characterId: inventoryTarget.characterId,
      catalogItemKey: item.catalogItemKey,
      equipped: item.equipped,
      quantity: item.quantity,
    }))
  )
  await db
    .update(characters)
    .set({ currency: STARTING_CURRENCY })
    .where(eq(characters.id, inventoryTarget.characterId))
}

/** Reads the persisted inventory rows, ordered by catalog key then id. */
export async function getInventoryTargetItems(): Promise<
  { catalogItemKey: string; equipped: boolean; quantity: number }[]
> {
  return getDb()
    .select({
      catalogItemKey: inventoryItems.catalogItemKey,
      equipped: inventoryItems.equipped,
      quantity: inventoryItems.quantity,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.characterId, inventoryTarget.characterId))
    .orderBy(asc(inventoryItems.catalogItemKey), asc(inventoryItems.id))
}

/** Rows for a single catalog key (e.g. all Soul Drop stacks). */
export async function getInventoryTargetRows(
  catalogItemKey: string
): Promise<{ equipped: boolean; quantity: number }[]> {
  const rows = await getInventoryTargetItems()
  return rows
    .filter((row) => row.catalogItemKey === catalogItemKey)
    .map(({ equipped, quantity }) => ({ equipped, quantity }))
}

/** Reads the persisted currency straight off the row. */
export async function getInventoryTargetCurrency(): Promise<number> {
  const [row] = await getDb()
    .select({ currency: characters.currency })
    .from(characters)
    .where(eq(characters.id, inventoryTarget.characterId))
    .limit(1)
  if (!row) throw new Error("inventory-target row missing")
  return row.currency
}
