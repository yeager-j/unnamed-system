import { z } from "zod/v4"

import type { InventoryPersistenceError } from "@/lib/db/inventory"
import { MAX_CURRENCY } from "@/lib/game/character"
import type { InventoryItemState } from "@/lib/game/items"

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
  catalogItemKey: z.string().regex(/^[a-z0-9-]+$/),
  quantity: z.number().int().positive(),
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

/** @deprecated Prefer {@link InventoryActionError}; kept for existing imports. */
export type EquipActionError = InventoryActionError

export type EquipActionSuccess = {
  items: InventoryItemState[]
  version: number
}

export type CurrencyActionSuccess = {
  currency: number
  version: number
}
