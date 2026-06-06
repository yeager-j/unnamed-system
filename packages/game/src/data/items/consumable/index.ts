import { soulDrop } from "@workspace/game/data/items/consumable/soul-drop"
import type { Item } from "@workspace/game/foundation/items/schema"

export const CONSUMABLE_ITEMS = {
  "soul-drop": soulDrop,
} as const satisfies Record<string, Item>
