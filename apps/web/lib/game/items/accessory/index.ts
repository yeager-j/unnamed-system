import type { Item } from "../schema"
import { shadowCharm } from "./shadow-charm"
import { zephyrBand } from "./zephyr-band"

export const ACCESSORY_ITEMS = {
  "zephyr-band": zephyrBand,
  "shadow-charm": shadowCharm,
} as const satisfies Record<string, Item>
