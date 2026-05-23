import { and, eq } from "drizzle-orm"

import {
  equipItem,
  unequipItem,
  type EquipError,
  type InventoryItemState,
} from "../game/items/equip"
import { err, ok, type Result } from "../game/result"
import { db } from "./index"
import { characters, inventoryItems } from "./schema/character"

/**
 * Persistence for the pure equip engine: load the inventory rows, run the
 * (pure) transition, then — only on engine success — open a transaction that
 * bumps `characters.updatedAt` conditionally on the caller-supplied
 * `expectedUpdatedAt` and writes the changed inventory rows. Running the
 * engine before the transaction means engine failures cost no tx; running the
 * conditional bump first inside the tx means it takes the row lock on
 * `characters` so a concurrent writer either blocks or causes our bump's
 * `WHERE` to miss. The shared row's `updatedAt` is the optimistic-concurrency
 * token for the whole sheet — including child rows like inventory — so a
 * concurrent edit anywhere on the character causes the version match to fail.
 */

/**
 * The pure engine's failures plus the persistence-layer ones this wrapper
 * surfaces.
 */
export type InventoryPersistenceError =
  | EquipError
  | "character-not-found"
  | "stale"

interface EquipPersistenceSuccess {
  items: InventoryItemState[]
  updatedAt: Date
}

async function equipPersist(
  characterId: string,
  expectedUpdatedAt: Date,
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
    // Use a JS Date (millisecond precision) rather than `sql\`now()\``
    // (Postgres microsecond precision). The column round-trips through
    // Drizzle's `{ mode: "date" }`, which truncates to milliseconds — if we
    // wrote microseconds, the client's next `expectedUpdatedAt` (a
    // millisecond-precision Date) would never match the stored value and
    // every follow-up save would return `"stale"`. Drizzle's `$onUpdate`
    // also uses `new Date()`, so this stays consistent across wrappers.
    const now = new Date()
    const [bumped] = await tx
      .update(characters)
      .set({ updatedAt: now })
      .where(
        and(
          eq(characters.id, characterId),
          eq(characters.updatedAt, expectedUpdatedAt)
        )
      )
      .returning({ updatedAt: characters.updatedAt })

    if (!bumped) {
      const stillExists = await tx
        .select({ id: characters.id })
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1)

      return stillExists.length === 0
        ? err("character-not-found")
        : err("stale")
    }

    for (const row of changed) {
      await tx
        .update(inventoryItems)
        .set({ equipped: row.equipped })
        .where(eq(inventoryItems.id, row.id))
    }

    return ok({ items: result.value, updatedAt: bumped.updatedAt })
  })
}

/**
 * Equips the inventory item with `itemId`, auto-unequipping any current
 * occupant of its slot. Returns the new inventory state and the row's new
 * `updatedAt` so the client can chain follow-up saves.
 */
export async function equipInventoryItem(
  characterId: string,
  itemId: string,
  expectedUpdatedAt: Date
): Promise<Result<EquipPersistenceSuccess, InventoryPersistenceError>> {
  return equipPersist(characterId, expectedUpdatedAt, (items) =>
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
  expectedUpdatedAt: Date
): Promise<Result<EquipPersistenceSuccess, InventoryPersistenceError>> {
  return equipPersist(characterId, expectedUpdatedAt, (items) =>
    unequipItem(items, itemId)
  )
}
