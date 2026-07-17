import { z } from "zod/v4"

import { getEquippableItem, getItem } from "@workspace/game-v2/catalog/items"
import {
  adjustCurrency,
  applyInventoryMutation,
  itemKeySchema,
  MAX_CURRENCY,
  type InventoryItemState,
  type InventoryMutation,
  type InventoryMutationError,
} from "@workspace/game-v2/items"
import { err, ok, type Result } from "@workspace/result"

import type {
  EntityWritePatch,
  EntityWriter,
  EntityWriteRefusal,
} from "../writers"

/**
 * The **equipment write family** (S2c — UNN-559): the Inventory tab's descriptor
 * arms + Writer, the first per-domain arm module (the S1-retro split — arms are
 * *sourced* here, but the one `entityWriteSchema` union, `ENTITY_WRITERS` map,
 * and exhaustive `applyEntityWrite` switch stay the single composition points in
 * `write.schema.ts`/`writers.ts`).
 *
 * **Catalog import exception.** The Writer statically imports the concrete
 * catalog lookups (`getItem`/`getEquippableItem`) rather than taking a
 * `GameData` slice — the mechanics Writer's `getMechanic` precedent. The
 * "ports, not catalog" rule gates engine logic *inside* `game-v2`; this module
 * is app-tier composition, and the hardcoded catalog is identical on both sides
 * of the wire, so client prediction and server pre-mint read the same data.
 * Deliberately NOT via `@/domain/game-engine-v2`, whose graph carries v1 catalog
 * weight this shared module must not pull in.
 */

const itemId = z.string().min(1)

/**
 * The id seam for `add` (CH18 determinism): `applyOp` runs as both the client's
 * optimistic predictor and the server's pre-mint, so row ids must derive from
 * the descriptor, not a per-side generator — otherwise an optimistic
 * add-then-equip would reference an id the server never minted. The caller
 * mints one `idSeed` (`crypto.randomUUID()`); both sides derive `${seed}-${n}`
 * (top-up-then-overflow stacking can create several rows per add).
 */
const idSeed = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)

/** The single-item ops — one arm, the verb enumerated, the noun parameterized. */
export const equipmentItemOpArm = z.object({
  component: z.literal("equipment"),
  op: z.enum(["equip", "unequip", "remove"]),
  itemId,
})

export const equipmentAddArm = z.object({
  component: z.literal("equipment"),
  op: z.literal("add"),
  catalogItemKey: itemKeySchema,
  // Wire sanity bound (the largest shipped stackSize); the engine owns
  // per-item stacking semantics.
  quantity: z.number().int().min(1).max(999),
  idSeed,
})

export const equipmentSetQuantityArm = z.object({
  component: z.literal("equipment"),
  op: z.literal("setQuantity"),
  itemId,
  // 0 drops the row (the engine's contract); the engine clamps to stackSize.
  quantity: z.number().int().min(0).max(999),
})

/** The wallet: delta-semantics, the pools `damage`/`heal` shape — a positive
 *  amount plus a verb op, so each write says what changed and the engine merges
 *  against the stored total (back-to-back adjustments sum; UNN-226 structural). */
export const equipmentCurrencyArm = z.object({
  component: z.literal("equipment"),
  op: z.enum(["addCurrency", "removeCurrency"]),
  amount: z.number().int().min(1).max(MAX_CURRENCY),
})

export type EquipmentWrite =
  | z.infer<typeof equipmentItemOpArm>
  | z.infer<typeof equipmentAddArm>
  | z.infer<typeof equipmentSetQuantityArm>
  | z.infer<typeof equipmentCurrencyArm>

/** The engine's item refusals plus the replay guard on seeded ids. */
export type InventoryWriteRefusal = InventoryMutationError | "duplicate-item-id"

const CATALOG_LOOKUPS = { getItem, getEquippableItem }

const EMPTY_EQUIPMENT = { items: [], currency: 0 }

type CurrencyWrite = Extract<
  EquipmentWrite,
  { op: "addCurrency" | "removeCurrency" }
>

/** Guard (not a bare `||` check) so the item-op path narrows to the mutation
 *  subset — both arms carry union-typed `op` discriminants, which plain
 *  control-flow narrowing can't exclude across. */
function isCurrencyWrite(write: EquipmentWrite): write is CurrencyWrite {
  return write.op === "addCurrency" || write.op === "removeCurrency"
}

function toMutation(
  write: Exclude<EquipmentWrite, CurrencyWrite>
): InventoryMutation {
  switch (write.op) {
    case "equip":
    case "unequip":
    case "remove":
      return { kind: write.op, itemId: write.itemId }
    case "add":
      return {
        kind: "add",
        catalogItemKey: write.catalogItemKey,
        quantity: write.quantity,
      }
    case "setQuantity":
      return {
        kind: "setQuantity",
        itemId: write.itemId,
        quantity: write.quantity,
      }
  }
}

function seededIds(seed: string): () => string {
  let n = 0
  return () => `${seed}-${n++}`
}

/** Only the `add` transition consults `newId` (the router's contract); every
 *  other op reaching it is a programmer error, not a recoverable refusal. */
function unreachableId(): string {
  throw new Error("newId is only consulted by the add op")
}

function hasDuplicateIds(items: readonly InventoryItemState[]): boolean {
  return new Set(items.map((item) => item.id)).size !== items.length
}

/**
 * `equip`/`unequip`/`add`/`setQuantity`/`remove` over the pure
 * `applyInventoryMutation` router, plus the `addCurrency`/`removeCurrency`
 * wallet deltas. `add` and the wallet ops create the component from absent (a
 * drafted entity may not carry an inventory yet — the talents precedent); the
 * row-addressed ops refuse `capability-missing` instead. `duplicate-item-id`
 * refuses a replayed or colliding `idSeed` before it corrupts the row set.
 */
export const equipmentWriter: EntityWriter<EquipmentWrite> = {
  component: "equipment",
  durableClass: "inventory",
  applyOp(components, write): Result<EntityWritePatch, EntityWriteRefusal> {
    if (isCurrencyWrite(write)) {
      const equipment = components.equipment ?? EMPTY_EQUIPMENT
      const delta = write.op === "addCurrency" ? write.amount : -write.amount
      return ok({ equipment: adjustCurrency(equipment, delta) })
    }

    const equipment =
      write.op === "add"
        ? (components.equipment ?? EMPTY_EQUIPMENT)
        : components.equipment
    if (equipment === undefined) return err("capability-missing")

    const next = applyInventoryMutation(
      equipment.items,
      toMutation(write),
      CATALOG_LOOKUPS,
      write.op === "add" ? seededIds(write.idSeed) : unreachableId
    )
    if (!next.ok) return next
    if (hasDuplicateIds(next.value)) return err("duplicate-item-id")

    return ok({ equipment: { ...equipment, items: next.value } })
  },
}
