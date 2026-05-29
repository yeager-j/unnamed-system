"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  addInventoryItem,
  adjustCurrency,
  equipInventoryItem,
  removeInventoryItem,
  setInventoryItemQuantity,
  unequipInventoryItem,
} from "@/lib/db/writes/inventory"
import { err, type Result } from "@/lib/result"

import {
  AddInventoryItemSchema,
  AdjustCurrencySchema,
  EquipInventoryItemSchema,
  RemoveInventoryItemSchema,
  SetInventoryItemQuantitySchema,
  type AddInventoryItemInput,
  type AdjustCurrencyInput,
  type CurrencyActionSuccess,
  type EquipInventoryItemInput,
  type InventoryActionError,
  type InventoryActionSuccess,
  type RemoveInventoryItemInput,
  type SetInventoryItemQuantityInput,
} from "./inventory.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * The Inventory tab's owner-mode Server Actions (PRD §6.1/§6.2/§7.7,
 * UNN-223). Each flows through a pure engine and the transactional persistence
 * wrapper in `lib/db/writes/inventory.ts`. After a successful write,
 * `revalidateCharacter` re-derives every stat that depends on equipped effects
 * (attributes, affinities, weapon attack roll) plus the currency display. Auth
 * is `requireOwner` — non-owners get `forbidden()` (HTTP 403). See
 * `lib/actions/README.md` for the canonical pattern.
 */

/**
 * Equips the inventory item with `itemId`, auto-unequipping any current
 * occupant of its slot.
 */
export async function equipInventoryItemAction(
  input: EquipInventoryItemInput
): Promise<Result<InventoryActionSuccess, InventoryActionError>> {
  const parsed = EquipInventoryItemSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)
  const result = await equipInventoryItem(
    character.id,
    parsed.data.itemId,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

/**
 * Unequips the inventory item with `itemId`. Idempotent when the row is
 * already unequipped.
 */
export async function unequipInventoryItemAction(
  input: EquipInventoryItemInput
): Promise<Result<InventoryActionSuccess, InventoryActionError>> {
  const parsed = EquipInventoryItemSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)
  const result = await unequipInventoryItem(
    character.id,
    parsed.data.itemId,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

/**
 * Adds `quantity` units of `catalogItemKey` from the catalog, stacking into an
 * existing row up to the item's stack size and overflowing into new rows.
 */
export async function addInventoryItemAction(
  input: AddInventoryItemInput
): Promise<Result<InventoryActionSuccess, InventoryActionError>> {
  const parsed = AddInventoryItemSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)
  const result = await addInventoryItem(
    character.id,
    parsed.data.catalogItemKey,
    parsed.data.quantity,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

/**
 * Sets the row `itemId` to `quantity`, clamped to the item's stack size; a
 * clamped value of 0 removes the row.
 */
export async function setInventoryItemQuantityAction(
  input: SetInventoryItemQuantityInput
): Promise<Result<InventoryActionSuccess, InventoryActionError>> {
  const parsed = SetInventoryItemQuantitySchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)
  const result = await setInventoryItemQuantity(
    character.id,
    parsed.data.itemId,
    parsed.data.quantity,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

/** Removes the row `itemId` outright (auto-unequipping it if equipped). */
export async function removeInventoryItemAction(
  input: RemoveInventoryItemInput
): Promise<Result<InventoryActionSuccess, InventoryActionError>> {
  const parsed = RemoveInventoryItemSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)
  const result = await removeInventoryItem(
    character.id,
    parsed.data.itemId,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

/** Adds `delta` to currency (negative to spend); clamped to `[0, MAX]`. */
export async function adjustCurrencyAction(
  input: AdjustCurrencyInput
): Promise<Result<CurrencyActionSuccess, InventoryActionError>> {
  const parsed = AdjustCurrencySchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)
  const result = await adjustCurrency(
    character.id,
    parsed.data.delta,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
