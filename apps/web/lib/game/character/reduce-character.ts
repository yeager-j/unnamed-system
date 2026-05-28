import {
  applyInventoryMutation,
  type InventoryItemState,
  type InventoryMutation,
} from "../items"
import { clampCurrency } from "./currency"
import {
  deriveHydratedCharacter,
  toRawInputs,
} from "./derive-hydrated-character"
import type { HydratedCharacter } from "./hydrated-character"

/**
 * One owner-mode edit to a character, in raw-input terms. Each variant maps to
 * a pure transition the server already runs; {@link reduceCharacter} applies it
 * and re-derives the whole sheet view, so an optimistic frame matches what the
 * server will produce — including cross-field consequences a slice-local patch
 * would miss.
 */
export type CharacterEdit =
  | { kind: "inventory"; mutation: InventoryMutation }
  | { kind: "currency"; delta: number }

const randomId = () => crypto.randomUUID()

/**
 * Applies a {@link CharacterEdit} to a {@link HydratedCharacter} by projecting
 * back to {@link RawCharacterInputs}, running the matching pure engine
 * transition, and re-deriving with {@link deriveHydratedCharacter} — the same
 * function the server loader uses. `newId` mints ids for inventory rows an
 * `add` creates (the optimistic frame defaults to `crypto.randomUUID`; the
 * server's revalidate later replaces them with persisted rows). Returns the
 * input unchanged when the underlying engine rejects the edit.
 */
export function reduceCharacter(
  character: HydratedCharacter,
  edit: CharacterEdit,
  newId: () => string = randomId
): HydratedCharacter {
  const raw = toRawInputs(character)

  if (edit.kind === "currency") {
    const currency = clampCurrency(raw.row.currency + edit.delta)
    return deriveHydratedCharacter({ ...raw, row: { ...raw.row, currency } })
  }

  const projection: InventoryItemState[] = raw.inventoryRows.map((row) => ({
    id: row.id,
    catalogItemKey: row.catalogItemKey,
    equipped: row.equipped,
    quantity: row.quantity,
  }))

  const result = applyInventoryMutation(projection, edit.mutation, newId)
  if (!result.ok) return character

  const inventoryRows = result.value.map((state) => ({
    ...state,
    characterId: raw.row.id,
  }))

  return deriveHydratedCharacter({ ...raw, inventoryRows })
}
