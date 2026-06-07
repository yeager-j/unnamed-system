import { clampCurrency } from "@workspace/game/engine/character/currency"
import type { RawCharacterInputs } from "@workspace/game/engine/character/derive-hydrated-character"
import {
  patchRow,
  type SliceResult,
} from "@workspace/game/engine/character/reduce/shared"
import { applyInventoryMutation } from "@workspace/game/engine/items/mutate"
import { type InventoryItemState } from "@workspace/game/engine/items/utils"
import { type ItemLookup } from "@workspace/game/engine/ports"
import type { InventoryEdit } from "@workspace/game/foundation/character/character-edit"

/**
 * Inventory + currency slice: the gold-piece pool and inventory-row mutations
 * (equip / add / set-quantity / remove). `newId` mints ids for rows an `add`
 * creates; an engine-rejected mutation (e.g. removing an unknown row) is a
 * no-op (`null`).
 */
export function reduceInventoryEdit(
  raw: RawCharacterInputs,
  edit: InventoryEdit,
  newId: () => string,
  lookups: ItemLookup
): SliceResult {
  if (edit.kind === "currency") {
    return patchRow(raw, {
      currency: clampCurrency(raw.row.currency + edit.delta),
    })
  }

  const projection: InventoryItemState[] = raw.inventoryRows.map((row) => ({
    id: row.id,
    catalogItemKey: row.catalogItemKey,
    equipped: row.equipped,
    quantity: row.quantity,
  }))

  const result = applyInventoryMutation(
    projection,
    edit.mutation,
    lookups,
    newId
  )
  if (!result.ok) return null

  const inventoryRows = result.value.map((state) => ({
    ...state,
    characterId: raw.row.id,
  }))

  return { ...raw, inventoryRows }
}
