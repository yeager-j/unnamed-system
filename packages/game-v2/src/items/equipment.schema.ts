import { z } from "zod/v4"

import { itemKeySchema } from "@workspace/game-v2/items/item.schema"

/**
 * The **Equipment** authored component (D36 — the standalone `Inheritance`
 * component collapsed onto `Archetypes`, so equipment is the one inventory
 * component PR5 adds). Presence = "this entity carries an inventory" (a PC now;
 * available to enemies/NPCs later — D22). One cohesive write surface.
 *
 * The component IS the mutation engine's operand: `items` is the persistence-
 * agnostic row projection the pure transitions (`items/mutate`) read and rewrite —
 * no second `InventoryItemState` projection (v1 kept them in sync by hand; here
 * they are the same shape).
 *
 * Equipment has **no resolved read-unit** — it contributes to a resolve via the
 * effects channel (`items/equipment-effects`) and the basic-attack resolver
 * (`items/basic-attack`), not a fold output. So it is in `ComponentRegistry` but
 * deliberately not in `ResolvedComponentRegistry`.
 */
export const inventoryItemSchema = z.object({
  id: z.string().min(1),
  catalogItemKey: itemKeySchema,
  equipped: z.boolean(),
  quantity: z.number().int().min(1),
})

/** The minimum inventory slice the mutation engine reads and rewrites — one
 *  persisted inventory row, transport-agnostic. */
export type InventoryItemState = z.infer<typeof inventoryItemSchema>

/** The wallet's ceiling — carried from v1's `MAX_CURRENCY` (display sanity, not
 *  a game rule). {@link adjustCurrency} clamps to it; the schema rejects past it. */
export const MAX_CURRENCY = 99_999_999

export const equipmentSchema = z.object({
  items: z.array(inventoryItemSchema).default([]),
  /** Carried gold (UNN-559). Lives on Equipment — the wallet renders on the
   *  Inventory tab and writes ride the same inventory-class token, so currency
   *  is component state, not an app column (supersedes v1's `characters.currency`). */
  currency: z.number().int().min(0).max(MAX_CURRENCY).default(0),
})

export type Equipment = z.infer<typeof equipmentSchema>

/**
 * Adjusts the wallet by a signed delta, clamping the result to
 * `[0, MAX_CURRENCY]` — delta (not set) semantics, the `applyDamage`/`applyHeal`
 * shape: each write says what *changed*, the current total is read from the
 * operand, so back-to-back adjustments sum instead of last-write-wins.
 */
export function adjustCurrency(equipment: Equipment, delta: number): Equipment {
  const next = equipment.currency + Math.trunc(delta)
  const clamped = Math.max(0, Math.min(MAX_CURRENCY, next))
  return { ...equipment, currency: clamped }
}
