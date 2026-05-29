import { z } from "zod/v4"

import type { InventoryPersistenceError } from "@/lib/db/writes/inventory"
import { MAX_CURRENCY } from "@/lib/game/character"
import { itemKeySchema, type InventoryItemState } from "@/lib/game/items"

/**
 * A hard ceiling on a single add's requested quantity. Defense-in-depth: the
 * Add dialog already clamps to the item's `stackSize`, but the action trusts
 * only this schema. Without it, a direct call with a huge quantity would drive
 * the `addItem` overflow loop — and the per-row inserts behind it — into an
 * unbounded write. The real per-item cap is `stackSize` (not knowable at schema
 * time), so this is a flat backstop well above any legitimate add.
 */
const MAX_ADD_QUANTITY = 9999

/**
 * Input schemas for the Inventory tab's owner-mode Server Actions. Lives in its
 * own file because a `"use server"` module can only export async functions —
 * keeping the schemas here lets client components pre-validate the same way the
 * actions will.
 */

export const EquipInventoryItemSchema = z.object({
  characterId: z.string().min(1),
  itemId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})

export type EquipInventoryItemInput = z.input<typeof EquipInventoryItemSchema>

export const AddInventoryItemSchema = z.object({
  characterId: z.string().min(1),
  catalogItemKey: itemKeySchema,
  quantity: z.number().int().positive().max(MAX_ADD_QUANTITY),
  expectedVersion: z.number().int().nonnegative(),
})

export type AddInventoryItemInput = z.input<typeof AddInventoryItemSchema>

export const SetInventoryItemQuantitySchema = z.object({
  characterId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  expectedVersion: z.number().int().nonnegative(),
})

export type SetInventoryItemQuantityInput = z.input<
  typeof SetInventoryItemQuantitySchema
>

export const RemoveInventoryItemSchema = z.object({
  characterId: z.string().min(1),
  itemId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})

export type RemoveInventoryItemInput = z.input<typeof RemoveInventoryItemSchema>

export const AdjustCurrencySchema = z.object({
  characterId: z.string().min(1),
  delta: z.number().int().gte(-MAX_CURRENCY).lte(MAX_CURRENCY),
  expectedVersion: z.number().int().nonnegative(),
})

export type AdjustCurrencyInput = z.input<typeof AdjustCurrencySchema>

export type InventoryActionError = "invalid-input" | InventoryPersistenceError

export type InventoryActionSuccess = {
  items: InventoryItemState[]
  version: number
}

export type CurrencyActionSuccess = {
  currency: number
  version: number
}
