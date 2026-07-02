import { soulDrop } from "@workspace/game-v2/catalog/items/consumable/soul-drop"
import type { Item } from "@workspace/game-v2/items/item.schema"

export const CONSUMABLE_ITEMS = {
  "soul-drop": soulDrop,
} as const satisfies Record<string, Item>
