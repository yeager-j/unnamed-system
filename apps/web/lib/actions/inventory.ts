"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  equipInventoryItem,
  unequipInventoryItem,
  type InventoryPersistenceError,
} from "@/lib/db/inventory"
import { type Result } from "@/lib/game/result"

import {
  EquipInventoryItemSchema,
  type EquipActionError,
  type EquipActionSuccess,
  type EquipInventoryItemInput,
} from "./inventory.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * The engine-touching Server Action: equipping or unequipping an item flows
 * through the pure {@link equipItem}/{@link unequipItem} engine and the
 * transactional persistence wrapper. After a successful write,
 * `revalidateCharacter` re-derives every stat that depends on equipped
 * effects (attributes, affinities, weapon attack roll). See
 * `lib/actions/README.md` for the canonical pattern.
 */

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

  if (result.ok) revalidateCharacter(character)

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
