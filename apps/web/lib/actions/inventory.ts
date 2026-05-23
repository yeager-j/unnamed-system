"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod/v4"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  equipInventoryItem,
  unequipInventoryItem,
  type InventoryPersistenceError,
} from "@/lib/db/inventory"
import type { InventoryItemState } from "@/lib/game/items/equip"
import { type Result } from "@/lib/game/result"

/**
 * The engine-touching Server Action: equipping or unequipping an item flows
 * through the pure {@link equipItem}/{@link unequipItem} engine and the
 * transactional persistence wrapper. After a successful write,
 * `revalidatePath` re-derives every stat that depends on equipped effects
 * (attributes, affinities, weapon attack roll). See `lib/actions/README.md`
 * for the canonical pattern.
 */

const EquipInventoryItemSchema = z.object({
  characterId: z.string().min(1),
  itemId: z.string().min(1),
  expectedUpdatedAt: z.coerce.date(),
})

type EquipInventoryItemInput = z.input<typeof EquipInventoryItemSchema>

type EquipActionError = "invalid-input" | InventoryPersistenceError

type EquipActionSuccess = { items: InventoryItemState[]; updatedAt: Date }

async function runEquipAction(
  input: EquipInventoryItemInput,
  operation: (
    characterId: string,
    itemId: string,
    expectedUpdatedAt: Date
  ) => Promise<Result<EquipActionSuccess, InventoryPersistenceError>>
): Promise<Result<EquipActionSuccess, EquipActionError>> {
  const parsed = EquipInventoryItemSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const character = await requireOwner(parsed.data.characterId)

  const result = await operation(
    character.id,
    parsed.data.itemId,
    parsed.data.expectedUpdatedAt
  )

  if (result.ok) {
    revalidatePath(`/c/${character.shortId}`)
  }

  return result
}

/**
 * Equips the inventory item with `itemId`, auto-unequipping any current
 * occupant of its slot.
 */
export async function equipInventoryItemAction(
  input: EquipInventoryItemInput
): Promise<Result<EquipActionSuccess, EquipActionError>> {
  return runEquipAction(input, equipInventoryItem)
}

/**
 * Unequips the inventory item with `itemId`. Idempotent when the row is
 * already unequipped.
 */
export async function unequipInventoryItemAction(
  input: EquipInventoryItemInput
): Promise<Result<EquipActionSuccess, EquipActionError>> {
  return runEquipAction(input, unequipInventoryItem)
}
