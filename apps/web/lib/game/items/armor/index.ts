import type { Item } from "../schema"
import { bladeturnMail } from "./bladeturn-mail"
import { warlockPact } from "./warlock-pact"

export const ARMOR_ITEMS = {
  "bladeturn-mail": bladeturnMail,
  "warlock-pact": warlockPact,
} as const satisfies Record<string, Item>
