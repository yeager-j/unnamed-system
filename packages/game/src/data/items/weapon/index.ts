import { censer } from "@workspace/game/data/items/weapon/censer"
import { longsword } from "@workspace/game/data/items/weapon/longsword"
import { runedCane } from "@workspace/game/data/items/weapon/runed-cane"
import { spear } from "@workspace/game/data/items/weapon/spear"
import { staff } from "@workspace/game/data/items/weapon/staff"
import type { Item } from "@workspace/game/foundation/items/schema"

export const WEAPON_ITEMS = {
  longsword,
  "runed-cane": runedCane,
  spear,
  censer,
  staff,
} as const satisfies Record<string, Item>
