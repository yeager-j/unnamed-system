import { bladeturnMail } from "@workspace/game/data/items/armor/bladeturn-mail"
import { warlockPact } from "@workspace/game/data/items/armor/warlock-pact"
import type { Item } from "@workspace/game/foundation/items/schema"

export const ARMOR_ITEMS = {
  "bladeturn-mail": bladeturnMail,
  "warlock-pact": warlockPact,
} as const satisfies Record<string, Item>
