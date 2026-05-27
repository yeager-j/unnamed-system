import { z } from "zod/v4"

import type { InventoryPersistenceError } from "@/lib/db/inventory"
import type { InventoryItemState } from "@/lib/game/items"

/**
 * Input schema for {@link equipInventoryItemAction} and
 * {@link unequipInventoryItemAction}. Lives in its own file because a
 * `"use server"` module can only export async functions — keeping the
 * schema here lets client components pre-validate the same way the action
 * will.
 */
export const EquipInventoryItemSchema = z.object({
  characterId: z.string().min(1),
  itemId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})

export type EquipInventoryItemInput = z.input<typeof EquipInventoryItemSchema>

export type EquipActionError = "invalid-input" | InventoryPersistenceError

export type EquipActionSuccess = {
  items: InventoryItemState[]
  version: number
}
