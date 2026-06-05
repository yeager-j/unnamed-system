import type { Item } from "../schema"
import { censer } from "./censer"
import { longsword } from "./longsword"
import { runedCane } from "./runed-cane"
import { spear } from "./spear"
import { staff } from "./staff"

export const WEAPON_ITEMS = {
  longsword,
  "runed-cane": runedCane,
  spear,
  censer,
  staff,
} as const satisfies Record<string, Item>
