import { bladeturnMail } from "@workspace/game-v2/catalog/items/armor/bladeturn-mail"
import { warlockPact } from "@workspace/game-v2/catalog/items/armor/warlock-pact"
import type { Item } from "@workspace/game-v2/items/item.schema"

export const ARMOR_ITEMS = {
  "bladeturn-mail": bladeturnMail,
  "warlock-pact": warlockPact,
} as const satisfies Record<string, Item>
