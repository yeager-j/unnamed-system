import { shadowCharm } from "@workspace/game/data/items/accessory/shadow-charm"
import { zephyrBand } from "@workspace/game/data/items/accessory/zephyr-band"
import type { Item } from "@workspace/game/foundation/items/schema"

export const ACCESSORY_ITEMS = {
  "zephyr-band": zephyrBand,
  "shadow-charm": shadowCharm,
} as const satisfies Record<string, Item>
