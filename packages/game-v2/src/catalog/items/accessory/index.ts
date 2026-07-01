import { shadowCharm } from "@workspace/game-v2/catalog/items/accessory/shadow-charm"
import { zephyrBand } from "@workspace/game-v2/catalog/items/accessory/zephyr-band"
import type { Item } from "@workspace/game-v2/items/item.schema"

export const ACCESSORY_ITEMS = {
  "zephyr-band": zephyrBand,
  "shadow-charm": shadowCharm,
} as const satisfies Record<string, Item>
