import { ENEMIES } from "@workspace/game-v2/catalog/enemies"
import { ITEMS } from "@workspace/game-v2/catalog/items"

/**
 * The catalog picker rows + lint vocab for the Template Set editor, shaped from
 * the hardcoded engine catalogs (`ENEMIES`/`ITEMS`). A table entry references an
 * enemy or item by catalog **key**; the comboboxes search by **label** and store
 * the key, and the lint resolves those keys against the same sets. Both are
 * derived once from the catalogs so the picker and the lint can never disagree
 * about what exists.
 */

/** One catalog option the entry comboboxes render: the stored `key`, the searched
 *  display `label`. */
export interface CatalogOption {
  key: string
  label: string
}

const byLabel = (a: CatalogOption, b: CatalogOption): number =>
  a.label.localeCompare(b.label)

/** Every catalog enemy as a `{ key, label }` picker row, sorted by label. Key is
 *  the authored entity id; label is its identity name (falling back to the key). */
export const ENEMY_OPTIONS: readonly CatalogOption[] = ENEMIES.map(
  (entity) => ({
    key: entity.id,
    label: entity.components.identity?.name ?? entity.id,
  })
).sort(byLabel)

/** Every catalog item as a `{ key, label }` picker row, sorted by label. */
export const ITEM_OPTIONS: readonly CatalogOption[] = ITEMS.map((item) => ({
  key: item.key,
  label: item.name,
})).sort(byLabel)

/** The enemy keys the lint's `LintVocab.enemyKeys` resolves references against. */
export const enemyKeys: ReadonlySet<string> = new Set(
  ENEMY_OPTIONS.map((option) => option.key)
)

/** The item keys the lint's `LintVocab.itemKeys` resolves references against. */
export const itemKeys: ReadonlySet<string> = new Set(
  ITEM_OPTIONS.map((option) => option.key)
)
