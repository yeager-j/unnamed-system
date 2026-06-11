import { censer } from "@workspace/game/data/items/weapon/censer"
import { dagger } from "@workspace/game/data/items/weapon/dagger"
import { grimoire } from "@workspace/game/data/items/weapon/grimoire"
import { longsword } from "@workspace/game/data/items/weapon/longsword"
import { lute } from "@workspace/game/data/items/weapon/lute"
import { runedCane } from "@workspace/game/data/items/weapon/runed-cane"
import { spear } from "@workspace/game/data/items/weapon/spear"
import { staff } from "@workspace/game/data/items/weapon/staff"
import type { Item } from "@workspace/game/foundation/items/schema"

export const WEAPON_ITEMS = {
  longsword,
  dagger,
  grimoire,
  "runed-cane": runedCane,
  spear,
  censer,
  staff,
  lute,
} as const satisfies Record<string, Item>
