import { and, eq, sql } from "drizzle-orm"

import {
  equipItem,
  unequipItem,
  type EquipError,
  type InventoryItemState,
} from "../game/items/equip"
import { err, ok, type Result } from "../game/result"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characters, inventoryItems } from "./schema/character"

/**
 * Persistence for the pure equip engine: load the inventory rows, run the
 * (pure) transition, then — only on engine success — open a transaction that
 * conditionally bumps `inventoryVersion` first (so the row lock either blocks
 * a concurrent writer or causes our WHERE to miss with no child rows
 * touched), then writes the changed inventory rows. Per-write-class
 * versioning is the UNN-140 baseline (`identityVersion`, `vitalsVersion`,
 * `inventoryVersion`, `progressionVersion`); an independent edit in another
 * class bumps a different column and does not race with this save.
 */

/**
 * The pure engine's failures plus the persistence-layer ones this wrapper
 * surfaces.
 */
export type InventoryPersistenceError =
  | EquipError
  | "character-not-found"
  | "stale"

export interface EquipPersistenceSuccess {
  items: InventoryItemState[]
  version: number
}

async function equipPersist(
  characterId: string,
  expectedVersion: number,
  transition: (
    items: InventoryItemState[]
  ) => Result<InventoryItemState[], EquipError>
): Promise<Result<EquipPersistenceSuccess, InventoryPersistenceError>> {
  const rows = await db
    .select({
      id: inventoryItems.id,
      catalogItemKey: inventoryItems.catalogItemKey,
      equipped: inventoryItems.equipped,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.characterId, characterId))

  const result = transition(rows)
  if (!result.ok) return result

  const changed = result.value.filter((next, index) => {
    const prev = rows[index]
    return !prev || prev.equipped !== next.equipped
  })

  return db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(characters)
      .set({
        inventoryVersion: sql`${characters.inventoryVersion} + 1`,
      })
      .where(
        and(
          eq(characters.id, characterId),
          eq(characters.inventoryVersion, expectedVersion)
        )
      )
      .returning({ inventoryVersion: characters.inventoryVersion })

    if (!bumped) {
      return (await characterExists(characterId))
        ? err("stale")
        : err("character-not-found")
    }

    for (const row of changed) {
      await tx
        .update(inventoryItems)
        .set({ equipped: row.equipped })
        .where(eq(inventoryItems.id, row.id))
    }

    return ok({ items: result.value, version: bumped.inventoryVersion })
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
): Promise<Result<EquipPersistenceSuccess, InventoryPersistenceError>> {
  return equipPersist(characterId, expectedVersion, (items) =>
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
): Promise<Result<EquipPersistenceSuccess, InventoryPersistenceError>> {
  return equipPersist(characterId, expectedVersion, (items) =>
    unequipItem(items, itemId)
  )
}
