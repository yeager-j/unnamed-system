import type { Item } from "@workspace/game/foundation/items/schema"

export const shadowCharm = {
  key: "shadow-charm",
  name: "Shadow Charm",
  description:
    "A blackened obsidian token that whispers in the wearer's voice, teaching the Evil Touch incantation.",
  stackSize: 1,
  equip: {
    slot: "accessory",
    effects: [{ type: "skill", skillKey: "evil-touch" }],
  },
} satisfies Item
