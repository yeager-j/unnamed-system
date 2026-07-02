import { censer } from "@workspace/game-v2/catalog/items/weapon/censer"
import { dagger } from "@workspace/game-v2/catalog/items/weapon/dagger"
import { greataxe } from "@workspace/game-v2/catalog/items/weapon/greataxe"
import { grimoire } from "@workspace/game-v2/catalog/items/weapon/grimoire"
import { longsword } from "@workspace/game-v2/catalog/items/weapon/longsword"
import { lute } from "@workspace/game-v2/catalog/items/weapon/lute"
import { runedCane } from "@workspace/game-v2/catalog/items/weapon/runed-cane"
import { spear } from "@workspace/game-v2/catalog/items/weapon/spear"
import { staff } from "@workspace/game-v2/catalog/items/weapon/staff"
import type { Item } from "@workspace/game-v2/items/item.schema"

export const WEAPON_ITEMS = {
  longsword,
  greataxe,
  dagger,
  grimoire,
  "runed-cane": runedCane,
  spear,
  censer,
  staff,
  lute,
} as const satisfies Record<string, Item>
