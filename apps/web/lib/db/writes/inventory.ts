import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { characters, inventoryItems } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS } from "@/lib/db/version-classes"
import { MAX_CURRENCY } from "@/lib/game/character"
import {
  addItem,
  equipItem,
  removeItem,
  setItemQuantity,
  unequipItem,
  type AddError,
  type EquipError,
  type InventoryItemState,
  type QuantityError,
} from "@/lib/game/items"
import { err, ok, type Result } from "@/lib/result"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for the pure inventory engine: load the inventory rows, run the
 * (pure) transition, then — only on engine success — open a transaction that
 * conditionally bumps `inventoryVersion` first (so the row lock either blocks
 * a concurrent writer or causes our WHERE to miss with no child rows touched),
 * then reconciles the changed inventory rows by **row id** (insert new rows,
 * delete dropped rows, update changed `equipped`/`quantity`). Equip, add,
 * quantity-adjust, and remove all flow through one mutator. Per-write-class
 * versioning is the UNN-140 baseline; an independent edit in another class
 * bumps a different column and does not race with this save.
 */

/** The pure engines' failures plus the persistence-layer ones this surfaces. */
export type InventoryPersistenceError =
  | EquipError
  | AddError
  | QuantityError
  | "character-not-found"
  | "stale"

export interface InventoryPersistenceSuccess {
  items: InventoryItemState[]
  version: number
}

type InventoryTransition = (
  items: InventoryItemState[]
) => Result<InventoryItemState[], EquipError | AddError | QuantityError>

async function mutateInventory(
  characterId: string,
  expectedVersion: number,
  transition: InventoryTransition
): Promise<Result<InventoryPersistenceSuccess, InventoryPersistenceError>> {
  const rows = await db
    .select({
      id: inventoryItems.id,
      catalogItemKey: inventoryItems.catalogItemKey,
      equipped: inventoryItems.equipped,
      quantity: inventoryItems.quantity,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.characterId, characterId))

  const result = transition(rows)
  if (!result.ok) return result

  const next = result.value
  const prevById = new Map(rows.map((row) => [row.id, row]))
  const nextIds = new Set(next.map((row) => row.id))

  return db.transaction(async (tx) => {
    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS.inventoryItems,
      expectedVersion
    )
    if (!bumped.ok) return bumped

    for (const row of rows) {
      if (!nextIds.has(row.id)) {
        await tx.delete(inventoryItems).where(eq(inventoryItems.id, row.id))
      }
    }

    for (const row of next) {
      const prev = prevById.get(row.id)
      if (!prev) {
        await tx.insert(inventoryItems).values({
          id: row.id,
          characterId,
          catalogItemKey: row.catalogItemKey,
          equipped: row.equipped,
          quantity: row.quantity,
        })
      } else if (
        prev.equipped !== row.equipped ||
        prev.quantity !== row.quantity
      ) {
        await tx
          .update(inventoryItems)
          .set({ equipped: row.equipped, quantity: row.quantity })
          .where(eq(inventoryItems.id, row.id))
      }
    }

    return ok({ items: next, version: bumped.value.version })
  })
}

/**
 * Equips the inventory item with `itemId`, auto-unequipping any current
 * occupant of its slot. Returns the new inventory state and the bumped
 * `inventoryVersion` so the client can chain follow-up saves.
 */
export async function equipInventoryItem(
  characterId: string,
  itemId: string,
  expectedVersion: number
): Promise<Result<InventoryPersistenceSuccess, InventoryPersistenceError>> {
  return mutateInventory(characterId, expectedVersion, (items) =>
    equipItem(items, itemId)
  )
}

/**
 * Unequips the inventory item with `itemId`. Idempotent when the row is
 * already unequipped.
 */
export async function unequipInventoryItem(
  characterId: string,
  itemId: string,
  expectedVersion: number
): Promise<Result<InventoryPersistenceSuccess, InventoryPersistenceError>> {
  return mutateInventory(characterId, expectedVersion, (items) =>
    unequipItem(items, itemId)
  )
}

/**
 * Adds `quantity` units of `catalogItemKey` from the catalog, stacking into
 * existing rows (up to the item's `stackSize`) and overflowing into new rows.
 */
export async function addInventoryItem(
  characterId: string,
  catalogItemKey: string,
  quantity: number,
  expectedVersion: number
): Promise<Result<InventoryPersistenceSuccess, InventoryPersistenceError>> {
  return mutateInventory(characterId, expectedVersion, (items) =>
    addItem(items, catalogItemKey, quantity, () => crypto.randomUUID())
  )
}

/**
 * Sets the row `itemId` to `quantity`, clamped to the item's stack size; a
 * clamped value of 0 removes the row.
 */
export async function setInventoryItemQuantity(
  characterId: string,
  itemId: string,
  quantity: number,
  expectedVersion: number
): Promise<Result<InventoryPersistenceSuccess, InventoryPersistenceError>> {
  return mutateInventory(characterId, expectedVersion, (items) =>
    setItemQuantity(items, itemId, quantity)
  )
}

/**
 * Removes the row `itemId` outright. A currently-equipped row is removed too —
 * deleting it unequips the item; the caller re-derives the dependent stats.
 */
export async function removeInventoryItem(
  characterId: string,
  itemId: string,
  expectedVersion: number
): Promise<Result<InventoryPersistenceSuccess, InventoryPersistenceError>> {
  return mutateInventory(characterId, expectedVersion, (items) =>
    removeItem(items, itemId)
  )
}

export interface CurrencyPersistenceSuccess {
  currency: number
  version: number
}

/**
 * Adds `delta` to the character's currency (negative to spend), clamped to
 * `[0, MAX_CURRENCY]` server-side. Shares the `inventoryVersion` write class
 * with the item mutations so the Inventory tab's optimistic frame stays
 * coherent. Reads the current value inside the transaction, so a failed
 * version-guarded write means a genuine concurrent edit (`stale`).
 */
export async function adjustCurrency(
  characterId: string,
  delta: number,
  expectedVersion: number
): Promise<Result<CurrencyPersistenceSuccess, InventoryPersistenceError>> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ currency: characters.currency })
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(1)

    if (!current) return err("character-not-found")

    const nextCurrency = Math.max(
      0,
      Math.min(MAX_CURRENCY, current.currency + delta)
    )

    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS.currency,
      expectedVersion,
      { currency: nextCurrency }
    )
    if (!bumped.ok) return bumped

    return ok({ currency: nextCurrency, version: bumped.value.version })
  })
}
