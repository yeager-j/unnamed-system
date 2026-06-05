import type { Item } from "../schema"
import { soulDrop } from "./soul-drop"

export const CONSUMABLE_ITEMS = {
  "soul-drop": soulDrop,
} as const satisfies Record<string, Item>
